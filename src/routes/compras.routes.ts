import { Router, Response } from "express";
import { prisma } from "../lib/prisma";
import { autenticar, autorizar, AuthRequest } from "../middlewares/auth.middleware";
import { sincronizarProducto } from "../lib/stock";
import { ErrorNegocio } from "../lib/errores";

const router = Router();

interface ItemCompra {
  productoId: number;
  cantidad: number;
  precioCosto: number;
  // Opcional: forma en que entra la mercadería (ej. Caja de 100).
  // Si no viene, entra en la unidad base del producto.
  unidadVentaId?: number;
  // Opcional: vencimiento de esta entrada.
  fechaVencimiento?: string;
}

// GET /api/compras — autenticado
router.get("/", autenticar, async (_req: AuthRequest, res: Response) => {
  const compras = await prisma.compra.findMany({
    orderBy: { fecha: "desc" },
    include: {
      proveedor: { select: { id: true, nombre: true } },
      _count: { select: { detalles: true } },
    },
  });
  res.json(
    compras.map((c) => ({
      id: c.id,
      fecha: c.fecha,
      total: c.total,
      estado: c.estado,
      observacion: c.observacion,
      proveedor: c.proveedor,
      itemsCount: c._count.detalles,
    }))
  );
});

// GET /api/compras/:id — detalle con items
router.get("/:id", autenticar, async (req: AuthRequest, res: Response) => {
  const compra = await prisma.compra.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      proveedor: true,
      detalles: {
        include: {
          producto: {
            select: { id: true, nombre: true, presentacion: true, unidadBase: true },
          },
        },
      },
    },
  });

  if (!compra) {
    res.status(404).json({ error: "Compra no encontrada" });
    return;
  }

  res.json({
    id: compra.id,
    fecha: compra.fecha,
    total: compra.total,
    estado: compra.estado,
    observacion: compra.observacion,
    proveedor: compra.proveedor,
    detalles: compra.detalles.map((d) => ({
      id: d.id,
      cantidad: d.cantidad,
      unidadNombre: d.unidadNombre,
      unidadEquivale: d.unidadEquivale,
      precioCosto: d.precioCosto,
      subtotal: Number(d.precioCosto) * d.cantidad,
      producto: d.producto,
    })),
  });
});

// POST /api/compras — crear compra RECIBIDA con sus lotes en una transacción (solo admin)
router.post("/", autenticar, autorizar("ADMIN"), async (req: AuthRequest, res: Response) => {
  const { proveedorId, items, observacion, fecha } = req.body as {
    proveedorId: number;
    items: ItemCompra[];
    observacion?: string;
    fecha?: string;
  };

  if (!proveedorId) {
    res.status(400).json({ error: "El proveedor es obligatorio" });
    return;
  }
  if (!Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: "Debes agregar al menos un item" });
    return;
  }

  // Validar items
  for (const [i, it] of items.entries()) {
    if (!it.productoId || it.cantidad === undefined || it.precioCosto === undefined) {
      res.status(400).json({ error: `Item #${i + 1}: producto, cantidad y precio costo son obligatorios` });
      return;
    }
    if (!Number.isInteger(Number(it.cantidad)) || Number(it.cantidad) <= 0) {
      res.status(400).json({ error: `Item #${i + 1}: la cantidad debe ser un entero mayor a 0` });
      return;
    }
    if (Number(it.precioCosto) < 0) {
      res.status(400).json({ error: `Item #${i + 1}: el precio costo no puede ser negativo` });
      return;
    }
    const existe = await prisma.producto.findUnique({ where: { id: Number(it.productoId) } });
    if (!existe) {
      res.status(404).json({ error: `Item #${i + 1}: producto no encontrado` });
      return;
    }
  }

  const proveedor = await prisma.proveedor.findUnique({ where: { id: Number(proveedorId) } });
  if (!proveedor || !proveedor.activo) {
    res.status(404).json({ error: "Proveedor no encontrado o inactivo" });
    return;
  }

  // Calcular total
  const total = items.reduce(
    (acc, it) => acc + Number(it.precioCosto) * Number(it.cantidad),
    0
  );

  // Transacción: crear compra, lotes y detalles
  const compra = await prisma.$transaction(async (tx) => {
    const nuevaCompra = await tx.compra.create({
      data: {
        proveedorId: Number(proveedorId),
        fecha: fecha ? new Date(fecha) : new Date(),
        total,
        estado: "RECIBIDA",
        observacion: observacion?.trim() || null,
      },
    });

    for (const it of items) {
      const productoId = Number(it.productoId);
      const producto = await tx.producto.findUnique({
        where: { id: productoId },
        include: { unidadesVenta: true },
      });
      if (!producto) throw new ErrorNegocio(`Producto ${productoId} no encontrado`, 404);

      // Resuelve la forma en que entra la mercadería (ej. Caja de 100).
      // Sin `unidadVentaId` entra en la unidad base.
      let unidadNombre = producto.unidadBase;
      let unidadEquivale = 1;
      if (it.unidadVentaId) {
        const unidad = producto.unidadesVenta.find((u) => u.id === Number(it.unidadVentaId));
        if (!unidad) {
          throw new ErrorNegocio(`La forma de compra elegida no existe para "${producto.nombre}"`);
        }
        unidadNombre = unidad.nombre;
        unidadEquivale = unidad.equivale;
      }

      // Cada item crea su propia entrada de stock con su vencimiento, de modo
      // que un mismo producto puede tener unidades con fechas distintas.
      // La entrada se guarda en unidades BASE: 2 cajas de 100 = 200 pastillas.
      const entrada = await tx.entradaStock.create({
        data: {
          productoId,
          cantidad: Number(it.cantidad) * unidadEquivale,
          fechaVencimiento: it.fechaVencimiento ? new Date(it.fechaVencimiento) : null,
        },
      });

      await tx.detalleCompra.create({
        data: {
          compraId: nuevaCompra.id,
          productoId,
          entradaId: entrada.id,
          unidadNombre,
          unidadEquivale,
          cantidad: Number(it.cantidad),
          precioCosto: it.precioCosto,
        },
      });

      // Recalcula stock total y vencimiento más próximo del producto
      await sincronizarProducto(tx, productoId);
    }

    return nuevaCompra;
  });

  res.status(201).json({ id: compra.id, total: compra.total, estado: compra.estado });
});

// PATCH /api/compras/:id/anular — solo admin
// Anula una compra RECIBIDA. Bloquea si algún lote ya tuvo ventas.
router.patch("/:id/anular", autenticar, autorizar("ADMIN"), async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);

  const compra = await prisma.compra.findUnique({
    where: { id },
    include: { detalles: { include: { producto: true, entrada: true } } },
  });

  if (!compra) {
    res.status(404).json({ error: "Compra no encontrada" });
    return;
  }
  if (compra.estado === "ANULADA") {
    res.status(400).json({ error: "La compra ya está anulada" });
    return;
  }

  // Solo se puede anular si la mercadería de ESTA compra sigue intacta:
  // su entrada debe conservar todas las unidades base que ingresaron.
  for (const d of compra.detalles) {
    const ingresaron = d.cantidad * d.unidadEquivale;
    const quedan = d.entrada?.cantidad ?? 0;
    if (quedan < ingresaron) {
      const base = d.producto.unidadBase.toLowerCase();
      res.status(409).json({
        error: `No se puede anular: de las ${ingresaron} ${base}(s) de "${d.producto.nombre}" que entraron con esta compra ya solo quedan ${quedan}. Probablemente se vendieron.`,
      });
      return;
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const d of compra.detalles) {
      if (d.entradaId) {
        // Se desliga el detalle y se elimina la entrada que creó esta compra
        await tx.detalleCompra.update({
          where: { id: d.id },
          data: { entradaId: null },
        });
        await tx.entradaStock.delete({ where: { id: d.entradaId } });
      }
      await sincronizarProducto(tx, d.productoId);
    }
    await tx.compra.update({
      where: { id },
      data: { estado: "ANULADA" },
    });
  });

  res.status(200).json({ id, estado: "ANULADA" });
});

export default router;

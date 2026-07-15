import { Router, Response } from "express";
import { prisma } from "../lib/prisma";
import { autenticar, autorizar, AuthRequest } from "../middlewares/auth.middleware";

const router = Router();

interface ItemCompra {
  productoId: number;
  cantidad: number;
  precioCosto: number;
  // Opcional: si viene, actualiza la fecha de vencimiento del producto.
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
          producto: { select: { id: true, nombre: true, presentacion: true } },
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
      // Suma la cantidad comprada al stock del producto y,
      // si se indicó, actualiza su fecha de vencimiento.
      await tx.producto.update({
        where: { id: Number(it.productoId) },
        data: {
          stock: { increment: Number(it.cantidad) },
          ...(it.fechaVencimiento && { fechaVencimiento: new Date(it.fechaVencimiento) }),
        },
      });

      await tx.detalleCompra.create({
        data: {
          compraId: nuevaCompra.id,
          productoId: Number(it.productoId),
          cantidad: Number(it.cantidad),
          precioCosto: it.precioCosto,
        },
      });
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
    include: { detalles: { include: { producto: true } } },
  });

  if (!compra) {
    res.status(404).json({ error: "Compra no encontrada" });
    return;
  }
  if (compra.estado === "ANULADA") {
    res.status(400).json({ error: "La compra ya está anulada" });
    return;
  }

  // No se puede anular si esa mercadería ya se vendió (el stock quedaría negativo)
  for (const d of compra.detalles) {
    if (d.producto.stock < d.cantidad) {
      res.status(409).json({
        error: `No se puede anular: "${d.producto.nombre}" ya no tiene las ${d.cantidad} unidades de esta compra en stock (quedan ${d.producto.stock}). Probablemente ya se vendieron.`,
      });
      return;
    }
  }

  await prisma.$transaction(async (tx) => {
    // Devolver (restar) del stock lo que había entrado con esta compra
    for (const d of compra.detalles) {
      await tx.producto.update({
        where: { id: d.productoId },
        data: { stock: { decrement: d.cantidad } },
      });
    }
    await tx.compra.update({
      where: { id },
      data: { estado: "ANULADA" },
    });
  });

  res.status(200).json({ id, estado: "ANULADA" });
});

export default router;

import { Router, Response } from "express";
import { prisma } from "../lib/prisma";
import { autenticar, autorizar, AuthRequest } from "../middlewares/auth.middleware";

const router = Router();

// GET /api/productos
router.get("/", async (_req, res: Response) => {
  const productos = await prisma.producto.findMany({
    where: { activo: true },
    include: {
      categoria: true,
      laboratorio: true,
      lotes: { select: { cantidadActual: true, fechaVencimiento: true } },
    },
    orderBy: { nombre: "asc" },
  });

  const conStock = productos.map((p) => ({
    ...p,
    stockTotal: p.lotes.reduce((acc, l) => acc + l.cantidadActual, 0),
    proximoVencimiento: p.lotes
      .filter((l) => l.cantidadActual > 0)
      .sort((a, b) => new Date(a.fechaVencimiento).getTime() - new Date(b.fechaVencimiento).getTime())[0]
      ?.fechaVencimiento ?? null,
  }));

  res.json(conStock);
});

// GET /api/productos/:id
router.get("/:id", async (req, res: Response) => {
  const producto = await prisma.producto.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      categoria: true,
      laboratorio: true,
      lotes: {
        where: { cantidadActual: { gt: 0 } },
        orderBy: { fechaVencimiento: "asc" },
      },
    },
  });

  if (!producto) {
    res.status(404).json({ error: "Producto no encontrado" });
    return;
  }
  res.json(producto);
});

// POST /api/productos — solo admin. Acepta opcionalmente `loteInicial`
// para crear producto + primer lote en una sola operación.
router.post(
  "/",
  autenticar,
  autorizar("ADMIN"),
  async (req: AuthRequest, res: Response) => {
    const {
      nombre, codigoBarras, descripcion, imagen, presentacion,
      concentracion, precioVenta, stockMinimo, requiereReceta,
      categoriaId, laboratorioId, loteInicial,
    } = req.body;

    if (!nombre || !precioVenta || !categoriaId) {
      res.status(400).json({ error: "Faltan campos obligatorios" });
      return;
    }

    // Validar lote inicial si se proveyó
    if (loteInicial) {
      const { nroLote, cantidad, fechaVencimiento, precioCosto } = loteInicial;
      if (!nroLote || cantidad === undefined || cantidad === null || !fechaVencimiento || precioCosto === undefined) {
        res.status(400).json({
          error: "Si proporcionas lote inicial, todos sus campos son obligatorios (nroLote, cantidad, fechaVencimiento, precioCosto)",
        });
        return;
      }
      if (Number(cantidad) <= 0) {
        res.status(400).json({ error: "La cantidad del lote debe ser mayor a 0" });
        return;
      }
    }

    const producto = await prisma.producto.create({
      data: {
        nombre, codigoBarras, descripcion, imagen, presentacion,
        concentracion, precioVenta, stockMinimo, requiereReceta,
        categoriaId: Number(categoriaId),
        laboratorioId: laboratorioId ? Number(laboratorioId) : undefined,
        ...(loteInicial && {
          lotes: {
            create: {
              nroLote: String(loteInicial.nroLote),
              cantidadActual: Number(loteInicial.cantidad),
              fechaVencimiento: new Date(loteInicial.fechaVencimiento),
              precioCosto: loteInicial.precioCosto,
            },
          },
        }),
      },
      include: { lotes: true },
    });
    res.status(201).json(producto);
  }
);

// GET /api/productos/:id/lotes — lista lotes del producto, ordenados por vencimiento
router.get("/:id/lotes", autenticar, async (req, res: Response) => {
  const lotes = await prisma.lote.findMany({
    where: { productoId: Number(req.params.id) },
    orderBy: { fechaVencimiento: "asc" },
  });
  res.json(lotes);
});

// POST /api/productos/:id/lotes — agrega un lote nuevo al producto (solo admin)
router.post(
  "/:id/lotes",
  autenticar,
  autorizar("ADMIN"),
  async (req: AuthRequest, res: Response) => {
    const productoId = Number(req.params.id);
    const { nroLote, cantidad, fechaVencimiento, precioCosto } = req.body;

    if (!nroLote || cantidad === undefined || cantidad === null || !fechaVencimiento || precioCosto === undefined) {
      res.status(400).json({ error: "Todos los campos son obligatorios" });
      return;
    }
    if (Number(cantidad) <= 0) {
      res.status(400).json({ error: "La cantidad debe ser mayor a 0" });
      return;
    }

    const producto = await prisma.producto.findUnique({ where: { id: productoId } });
    if (!producto) {
      res.status(404).json({ error: "Producto no encontrado" });
      return;
    }

    const lote = await prisma.lote.create({
      data: {
        productoId,
        nroLote: String(nroLote),
        cantidadActual: Number(cantidad),
        fechaVencimiento: new Date(fechaVencimiento),
        precioCosto,
      },
    });
    res.status(201).json(lote);
  }
);

// PUT /api/productos/:id — solo admin
router.put(
  "/:id",
  autenticar,
  autorizar("ADMIN"),
  async (req: AuthRequest, res: Response) => {
    const {
      nombre, codigoBarras, descripcion, imagen, presentacion,
      concentracion, precioVenta, stockMinimo, requiereReceta,
      categoriaId, laboratorioId,
    } = req.body;

    // Allow-list: solo estos campos son editables. Evita que el cliente
    // escriba columnas sensibles (activo, createdAt, etc.) vía mass assignment.
    const data: Record<string, unknown> = {};
    if (nombre !== undefined) data.nombre = nombre;
    if (codigoBarras !== undefined) data.codigoBarras = codigoBarras;
    if (descripcion !== undefined) data.descripcion = descripcion;
    if (imagen !== undefined) data.imagen = imagen;
    if (presentacion !== undefined) data.presentacion = presentacion;
    if (concentracion !== undefined) data.concentracion = concentracion;
    if (precioVenta !== undefined) data.precioVenta = precioVenta;
    if (stockMinimo !== undefined) data.stockMinimo = stockMinimo;
    if (requiereReceta !== undefined) data.requiereReceta = requiereReceta;
    if (categoriaId !== undefined) data.categoriaId = Number(categoriaId);
    if (laboratorioId !== undefined) {
      data.laboratorioId = laboratorioId ? Number(laboratorioId) : null;
    }

    const producto = await prisma.producto.update({
      where: { id: Number(req.params.id) },
      data,
    });
    res.json(producto);
  }
);

// DELETE /api/productos/:id — soft delete, solo admin
router.delete(
  "/:id",
  autenticar,
  autorizar("ADMIN"),
  async (req: AuthRequest, res: Response) => {
    await prisma.producto.update({
      where: { id: Number(req.params.id) },
      data: { activo: false },
    });
    res.status(204).send();
  }
);

export default router;

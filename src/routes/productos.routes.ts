import { Router, Response } from "express";
import { prisma } from "../lib/prisma";
import { autenticar, autorizar, AuthRequest } from "../middlewares/auth.middleware";

const router = Router();

// GET /api/productos
router.get("/", async (_req, res: Response) => {
  const productos = await prisma.producto.findMany({
    where: { activo: true },
    include: { categoria: true, laboratorio: true },
    orderBy: { nombre: "asc" },
  });
  res.json(productos);
});

// GET /api/productos/:id
router.get("/:id", async (req, res: Response) => {
  const producto = await prisma.producto.findUnique({
    where: { id: Number(req.params.id) },
    include: { categoria: true, laboratorio: true },
  });

  if (!producto) {
    res.status(404).json({ error: "Producto no encontrado" });
    return;
  }
  res.json(producto);
});

// POST /api/productos — solo admin
router.post(
  "/",
  autenticar,
  autorizar("ADMIN"),
  async (req: AuthRequest, res: Response) => {
    const {
      nombre, codigoBarras, descripcion, imagen, presentacion,
      concentracion, precioVenta, stock, stockMinimo, fechaVencimiento,
      requiereReceta, categoriaId, laboratorioId,
    } = req.body;

    // La categoría es opcional; solo nombre y precio son obligatorios.
    if (!nombre || !precioVenta) {
      res.status(400).json({ error: "El nombre y el precio de venta son obligatorios" });
      return;
    }

    if (stock !== undefined && (!Number.isInteger(Number(stock)) || Number(stock) < 0)) {
      res.status(400).json({ error: "El stock debe ser un número entero mayor o igual a 0" });
      return;
    }

    const producto = await prisma.producto.create({
      data: {
        nombre,
        codigoBarras,
        descripcion,
        imagen,
        presentacion,
        concentracion,
        precioVenta,
        stock: stock !== undefined ? Number(stock) : 0,
        stockMinimo,
        fechaVencimiento: fechaVencimiento ? new Date(fechaVencimiento) : null,
        requiereReceta,
        categoriaId: categoriaId ? Number(categoriaId) : null,
        laboratorioId: laboratorioId ? Number(laboratorioId) : undefined,
      },
    });
    res.status(201).json(producto);
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
      concentracion, precioVenta, stock, stockMinimo, fechaVencimiento,
      requiereReceta, categoriaId, laboratorioId,
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
    if (fechaVencimiento !== undefined) {
      data.fechaVencimiento = fechaVencimiento ? new Date(fechaVencimiento) : null;
    }
    if (stock !== undefined) {
      if (!Number.isInteger(Number(stock)) || Number(stock) < 0) {
        res.status(400).json({ error: "El stock debe ser un número entero mayor o igual a 0" });
        return;
      }
      data.stock = Number(stock);
    }
    if (categoriaId !== undefined) {
      data.categoriaId = categoriaId ? Number(categoriaId) : null;
    }
    if (laboratorioId !== undefined) {
      data.laboratorioId = laboratorioId ? Number(laboratorioId) : null;
    }

    const id = Number(req.params.id);
    const existe = await prisma.producto.findUnique({ where: { id } });
    if (!existe) {
      res.status(404).json({ error: "Producto no encontrado" });
      return;
    }

    const producto = await prisma.producto.update({ where: { id }, data });
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

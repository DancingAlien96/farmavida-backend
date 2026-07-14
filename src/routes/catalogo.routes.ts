import { Router, Response } from "express";
import { prisma } from "../lib/prisma";
import { autenticar, autorizar, AuthRequest } from "../middlewares/auth.middleware";

const router = Router();

// GET /api/categorias — listado plano con nombre del padre y conteo de productos
router.get("/", async (_req, res: Response) => {
  const categorias = await prisma.categoria.findMany({
    orderBy: { nombre: "asc" },
    include: {
      parent: { select: { id: true, nombre: true } },
      _count: { select: { productos: true, hijos: true } },
    },
  });
  res.json(
    categorias.map((c) => ({
      id: c.id,
      nombre: c.nombre,
      parentId: c.parentId,
      parent: c.parent,
      productosCount: c._count.productos,
      hijosCount: c._count.hijos,
    }))
  );
});

// POST /api/categorias — solo admin
router.post("/", autenticar, autorizar("ADMIN"), async (req: AuthRequest, res: Response) => {
  const { nombre, parentId } = req.body;

  if (!nombre?.trim()) {
    res.status(400).json({ error: "El nombre es obligatorio" });
    return;
  }

  const existe = await prisma.categoria.findUnique({ where: { nombre: nombre.trim() } });
  if (existe) {
    res.status(409).json({ error: "Ya existe una categoría con ese nombre" });
    return;
  }

  if (parentId) {
    const padre = await prisma.categoria.findUnique({ where: { id: Number(parentId) } });
    if (!padre) {
      res.status(400).json({ error: "La categoría padre no existe" });
      return;
    }
  }

  const categoria = await prisma.categoria.create({
    data: {
      nombre: nombre.trim(),
      parentId: parentId ? Number(parentId) : null,
    },
  });
  res.status(201).json(categoria);
});

// PUT /api/categorias/:id — solo admin
router.put("/:id", autenticar, autorizar("ADMIN"), async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  const { nombre, parentId } = req.body;

  if (!nombre?.trim()) {
    res.status(400).json({ error: "El nombre es obligatorio" });
    return;
  }

  const otra = await prisma.categoria.findUnique({ where: { nombre: nombre.trim() } });
  if (otra && otra.id !== id) {
    res.status(409).json({ error: "Ya existe una categoría con ese nombre" });
    return;
  }

  // No permitir referenciar a sí misma como padre
  if (parentId && Number(parentId) === id) {
    res.status(400).json({ error: "Una categoría no puede ser su propio padre" });
    return;
  }

  const categoria = await prisma.categoria.update({
    where: { id },
    data: {
      nombre: nombre.trim(),
      parentId: parentId ? Number(parentId) : null,
    },
  });
  res.json(categoria);
});

// DELETE /api/categorias/:id — solo admin
router.delete("/:id", autenticar, autorizar("ADMIN"), async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);

  const [productos, hijos] = await Promise.all([
    prisma.producto.count({ where: { categoriaId: id } }),
    prisma.categoria.count({ where: { parentId: id } }),
  ]);

  if (productos > 0) {
    res.status(409).json({
      error: `No se puede eliminar: ${productos} producto(s) usan esta categoría`,
    });
    return;
  }
  if (hijos > 0) {
    res.status(409).json({
      error: `No se puede eliminar: tiene ${hijos} subcategoría(s)`,
    });
    return;
  }

  await prisma.categoria.delete({ where: { id } });
  res.status(204).send();
});

// GET /api/categorias/laboratorios — DEPRECADO, mantenido por compatibilidad
// Usar GET /api/laboratorios en su lugar
router.get("/laboratorios", async (_req, res: Response) => {
  const laboratorios = await prisma.laboratorio.findMany({
    orderBy: { nombre: "asc" },
  });
  res.json(laboratorios);
});

export default router;

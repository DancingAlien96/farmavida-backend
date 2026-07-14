import { Router, Response } from "express";
import { prisma } from "../lib/prisma";
import { autenticar, autorizar, AuthRequest } from "../middlewares/auth.middleware";

const router = Router();

// GET /api/laboratorios — autenticado (cualquier rol interno necesita la lista)
router.get("/", autenticar, async (_req: AuthRequest, res: Response) => {
  const laboratorios = await prisma.laboratorio.findMany({
    orderBy: { nombre: "asc" },
    include: { _count: { select: { productos: true } } },
  });
  res.json(
    laboratorios.map((l) => ({
      id: l.id,
      nombre: l.nombre,
      pais: l.pais,
      productosCount: l._count.productos,
    }))
  );
});

// POST /api/laboratorios — solo admin
router.post("/", autenticar, autorizar("ADMIN"), async (req: AuthRequest, res: Response) => {
  const { nombre, pais } = req.body;

  if (!nombre?.trim()) {
    res.status(400).json({ error: "El nombre es obligatorio" });
    return;
  }

  const existe = await prisma.laboratorio.findUnique({ where: { nombre: nombre.trim() } });
  if (existe) {
    res.status(409).json({ error: "Ya existe un laboratorio con ese nombre" });
    return;
  }

  const laboratorio = await prisma.laboratorio.create({
    data: { nombre: nombre.trim(), pais: pais?.trim() || null },
  });
  res.status(201).json(laboratorio);
});

// PUT /api/laboratorios/:id — solo admin
router.put("/:id", autenticar, autorizar("ADMIN"), async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  const { nombre, pais } = req.body;

  if (!nombre?.trim()) {
    res.status(400).json({ error: "El nombre es obligatorio" });
    return;
  }

  const otro = await prisma.laboratorio.findUnique({ where: { nombre: nombre.trim() } });
  if (otro && otro.id !== id) {
    res.status(409).json({ error: "Ya existe un laboratorio con ese nombre" });
    return;
  }

  const laboratorio = await prisma.laboratorio.update({
    where: { id },
    data: { nombre: nombre.trim(), pais: pais?.trim() || null },
  });
  res.json(laboratorio);
});

// DELETE /api/laboratorios/:id — solo admin
router.delete("/:id", autenticar, autorizar("ADMIN"), async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);

  const productos = await prisma.producto.count({ where: { laboratorioId: id } });
  if (productos > 0) {
    res.status(409).json({
      error: `No se puede eliminar: ${productos} producto(s) referencian este laboratorio`,
    });
    return;
  }

  await prisma.laboratorio.delete({ where: { id } });
  res.status(204).send();
});

export default router;

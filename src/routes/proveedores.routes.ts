import { Router, Response } from "express";
import { prisma } from "../lib/prisma";
import { autenticar, autorizar, AuthRequest } from "../middlewares/auth.middleware";

const router = Router();

// GET /api/proveedores — autenticado
router.get("/", autenticar, async (req: AuthRequest, res: Response) => {
  const incluirInactivos = req.query.incluirInactivos === "true";
  const proveedores = await prisma.proveedor.findMany({
    where: incluirInactivos ? undefined : { activo: true },
    orderBy: { nombre: "asc" },
    include: { _count: { select: { compras: true } } },
  });
  res.json(
    proveedores.map((p) => ({
      id: p.id,
      nombre: p.nombre,
      ruc: p.ruc,
      contacto: p.contacto,
      telefono: p.telefono,
      email: p.email,
      activo: p.activo,
      comprasCount: p._count.compras,
    }))
  );
});

// POST /api/proveedores — solo admin
router.post("/", autenticar, autorizar("ADMIN"), async (req: AuthRequest, res: Response) => {
  const { nombre, ruc, contacto, telefono, email } = req.body;

  if (!nombre?.trim()) {
    res.status(400).json({ error: "El nombre es obligatorio" });
    return;
  }

  if (ruc?.trim()) {
    const existe = await prisma.proveedor.findUnique({ where: { ruc: ruc.trim() } });
    if (existe) {
      res.status(409).json({ error: "Ya existe un proveedor con ese RUC" });
      return;
    }
  }

  const proveedor = await prisma.proveedor.create({
    data: {
      nombre: nombre.trim(),
      ruc: ruc?.trim() || null,
      contacto: contacto?.trim() || null,
      telefono: telefono?.trim() || null,
      email: email?.trim() || null,
    },
  });
  res.status(201).json(proveedor);
});

// PUT /api/proveedores/:id — solo admin
router.put("/:id", autenticar, autorizar("ADMIN"), async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  const { nombre, ruc, contacto, telefono, email, activo } = req.body;

  if (!nombre?.trim()) {
    res.status(400).json({ error: "El nombre es obligatorio" });
    return;
  }

  if (ruc?.trim()) {
    const otro = await prisma.proveedor.findUnique({ where: { ruc: ruc.trim() } });
    if (otro && otro.id !== id) {
      res.status(409).json({ error: "Ya existe un proveedor con ese RUC" });
      return;
    }
  }

  const proveedor = await prisma.proveedor.update({
    where: { id },
    data: {
      nombre: nombre.trim(),
      ruc: ruc?.trim() || null,
      contacto: contacto?.trim() || null,
      telefono: telefono?.trim() || null,
      email: email?.trim() || null,
      ...(activo !== undefined && { activo: Boolean(activo) }),
    },
  });
  res.json(proveedor);
});

// DELETE /api/proveedores/:id — soft delete (porque puede tener compras)
router.delete("/:id", autenticar, autorizar("ADMIN"), async (req: AuthRequest, res: Response) => {
  await prisma.proveedor.update({
    where: { id: Number(req.params.id) },
    data: { activo: false },
  });
  res.status(204).send();
});

export default router;

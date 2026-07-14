import { Router, Response } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { autenticar, autorizar, AuthRequest } from "../middlewares/auth.middleware";
import { Rol } from "../../generated/prisma/enums";

const router = Router();

// Todas las rutas requieren ADMIN
router.use(autenticar, autorizar("ADMIN"));

// GET /api/usuarios — listar todos
router.get("/", async (_req: AuthRequest, res: Response) => {
  const usuarios = await prisma.usuario.findMany({
    select: {
      id: true,
      email: true,
      rol: true,
      activo: true,
      createdAt: true,
      updatedAt: true,
      cliente: { select: { nombres: true, apellidos: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  res.json(usuarios);
});

// POST /api/usuarios — crear usuario interno (ADMIN o FARMACEUTICO)
router.post("/", async (req: AuthRequest, res: Response) => {
  const { email, password, rol } = req.body;

  if (!email || !password || !rol) {
    res.status(400).json({ error: "Email, contraseña y rol son obligatorios" });
    return;
  }

  if (password.length < 6) {
    res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres" });
    return;
  }

  if (rol !== Rol.ADMIN && rol !== Rol.FARMACEUTICO) {
    res.status(400).json({ error: "Rol inválido. Use ADMIN o FARMACEUTICO" });
    return;
  }

  const existe = await prisma.usuario.findUnique({ where: { email } });
  if (existe) {
    res.status(409).json({ error: "El email ya está registrado" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const usuario = await prisma.usuario.create({
    data: { email, passwordHash, rol, activo: true },
    select: { id: true, email: true, rol: true, activo: true, createdAt: true },
  });

  res.status(201).json(usuario);
});

// PATCH /api/usuarios/:id — editar email / rol / activo
router.patch("/:id", async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  const { email, rol, activo } = req.body;

  const data: { email?: string; rol?: Rol; activo?: boolean } = {};

  if (email !== undefined) {
    if (!email) {
      res.status(400).json({ error: "Email inválido" });
      return;
    }
    const otro = await prisma.usuario.findUnique({ where: { email } });
    if (otro && otro.id !== id) {
      res.status(409).json({ error: "El email ya está en uso" });
      return;
    }
    data.email = email;
  }

  if (rol !== undefined) {
    if (rol !== Rol.ADMIN && rol !== Rol.FARMACEUTICO) {
      res.status(400).json({ error: "Rol inválido. Use ADMIN o FARMACEUTICO" });
      return;
    }
    data.rol = rol;
  }

  if (activo !== undefined) {
    if (!activo && req.user?.id === id) {
      res.status(400).json({ error: "No puedes desactivar tu propia cuenta" });
      return;
    }
    data.activo = Boolean(activo);
  }

  const usuario = await prisma.usuario.update({
    where: { id },
    data,
    select: { id: true, email: true, rol: true, activo: true, updatedAt: true },
  });

  res.json(usuario);
});

// PATCH /api/usuarios/:id/password — restablecer contraseña
router.patch("/:id/password", async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  const { password } = req.body;

  if (!password || password.length < 6) {
    res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.usuario.update({
    where: { id },
    data: { passwordHash },
  });

  res.status(204).send();
});

// DELETE /api/usuarios/:id — soft delete (activo = false)
router.delete("/:id", async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);

  if (req.user?.id === id) {
    res.status(400).json({ error: "No puedes eliminar tu propia cuenta" });
    return;
  }

  await prisma.usuario.update({
    where: { id },
    data: { activo: false },
  });

  res.status(204).send();
});

export default router;

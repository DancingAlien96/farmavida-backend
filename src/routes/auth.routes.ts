import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma";
import { Rol } from "../../generated/prisma/enums";

const router = Router();

// POST /api/auth/register
router.post("/register", async (req: Request, res: Response) => {
  const { email, password, nombres, apellidos, dni, telefono } = req.body;

  if (!email || !password || !nombres || !apellidos) {
    res.status(400).json({ error: "Faltan campos obligatorios" });
    return;
  }

  const existe = await prisma.usuario.findUnique({ where: { email } });
  if (existe) {
    res.status(409).json({ error: "El email ya está registrado" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  // El registro público SIEMPRE crea un CLIENTE. Los roles privilegiados
  // (ADMIN/FARMACEUTICO) solo se asignan desde el módulo de usuarios (protegido).
  const usuario = await prisma.usuario.create({
    data: {
      email,
      passwordHash,
      rol: Rol.CLIENTE,
      cliente: {
        create: { nombres, apellidos, dni, telefono },
      },
    },
    select: { id: true, email: true, rol: true },
  });

  res.status(201).json(usuario);
});

// POST /api/auth/login
router.post("/login", async (req: Request, res: Response) => {
  const { email, password } = req.body;

  console.log(`[LOGIN] Intento de inicio de sesión: ${email}`);

  if (!email || !password) {
    console.log(`[LOGIN] Faltan campos`);
    res.status(400).json({ error: "Email y contraseña son obligatorios" });
    return;
  }

  const usuario = await prisma.usuario.findUnique({ where: { email } });
  if (!usuario || !usuario.activo) {
    console.log(`[LOGIN] Usuario no encontrado o inactivo: ${email}`);
    res.status(401).json({ error: "Credenciales inválidas" });
    return;
  }

  const valido = await bcrypt.compare(password, usuario.passwordHash);
  if (!valido) {
    console.log(`[LOGIN] Contraseña incorrecta para: ${email}`);
    res.status(401).json({ error: "Credenciales inválidas" });
    return;
  }

  const token = jwt.sign(
    { id: usuario.id, rol: usuario.rol },
    process.env.JWT_SECRET!,
    { expiresIn: "8h" }
  );

  console.log(`[LOGIN] ✅ Sesión iniciada: ${email} (${usuario.rol})`);
  res.json({
    token,
    usuario: {
      id: usuario.id,
      email: usuario.email,
      rol: usuario.rol,
    },
  });
});

export default router;

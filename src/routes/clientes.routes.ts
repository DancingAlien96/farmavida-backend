import { Router, Response } from "express";
import bcrypt from "bcryptjs";
import { randomInt } from "crypto";
import { prisma } from "../lib/prisma";
import { autenticar, autorizar, AuthRequest } from "../middlewares/auth.middleware";
import { Rol } from "../../generated/prisma/enums";

const router = Router();

// Genera contraseña temporal de 10 caracteres alfanuméricos.
// El admin la verá una sola vez al crear; después se puede resetear desde
// /dashboard/configuracion → Usuarios.
function generarPasswordTemporal(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 10; i++) {
    out += chars[randomInt(chars.length)]; // aleatoriedad criptográficamente segura
  }
  return out;
}

// GET /api/clientes — listado (admin y farmacéutico, el POS lo necesita)
router.get(
  "/",
  autenticar,
  autorizar("ADMIN", "FARMACEUTICO"),
  async (req: AuthRequest, res: Response) => {
    const incluirInactivos = req.query.incluirInactivos === "true";
    const clientes = await prisma.cliente.findMany({
      where: incluirInactivos ? undefined : { usuario: { activo: true } },
      orderBy: { id: "desc" },
      include: {
        usuario: { select: { id: true, email: true, activo: true, createdAt: true } },
        _count: { select: { ventas: true } },
      },
    });
    res.json(
      clientes.map((c) => ({
        id: c.id,
        nombres: c.nombres,
        apellidos: c.apellidos,
        dpi: c.dpi,
        nit: c.nit,
        telefono: c.telefono,
        direccion: c.direccion,
        fechaNacimiento: c.fechaNacimiento,
        usuario: c.usuario,
        ventasCount: c._count.ventas,
      }))
    );
  }
);

// GET /api/clientes/:id — detalle
router.get(
  "/:id",
  autenticar,
  autorizar("ADMIN", "FARMACEUTICO"),
  async (req: AuthRequest, res: Response) => {
    const cliente = await prisma.cliente.findUnique({
      where: { id: Number(req.params.id) },
      include: { usuario: { select: { id: true, email: true, activo: true } } },
    });
    if (!cliente) {
      res.status(404).json({ error: "Cliente no encontrado" });
      return;
    }
    res.json(cliente);
  }
);

// POST /api/clientes — admin y farmacéutico (el POS necesita registrar clientes al vuelo).
// Crea Usuario (rol CLIENTE) + Cliente en transacción.
router.post(
  "/",
  autenticar,
  autorizar("ADMIN", "FARMACEUTICO"),
  async (req: AuthRequest, res: Response) => {
    const { nombres, apellidos, dpi, nit, telefono, direccion, fechaNacimiento } = req.body;

    if (!nombres?.trim() || !apellidos?.trim()) {
      res.status(400).json({ error: "Nombres y apellidos son obligatorios" });
      return;
    }

    if (dpi?.trim()) {
      const existe = await prisma.cliente.findUnique({ where: { dpi: dpi.trim() } });
      if (existe) {
        res.status(409).json({ error: "Ya existe un cliente con ese DPI" });
        return;
      }
    }

    // Generar email único basado en DPI o un sufijo aleatorio
    const baseEmail = dpi?.trim() || Math.random().toString(36).slice(2, 10);
    let email = `cliente_${baseEmail}@farmavida.local`;
    // En el caso extremo de colisión, agregar timestamp
    if (await prisma.usuario.findUnique({ where: { email } })) {
      email = `cliente_${baseEmail}_${Date.now()}@farmavida.local`;
    }

    const passwordTemporal = generarPasswordTemporal();
    const passwordHash = await bcrypt.hash(passwordTemporal, 10);

    const cliente = await prisma.$transaction(async (tx) => {
      const usuario = await tx.usuario.create({
        data: { email, passwordHash, rol: Rol.CLIENTE, activo: true },
      });
      return tx.cliente.create({
        data: {
          usuarioId: usuario.id,
          nombres: nombres.trim(),
          apellidos: apellidos.trim(),
          dpi: dpi?.trim() || null,
          nit: nit?.trim() || null,
          telefono: telefono?.trim() || null,
          direccion: direccion?.trim() || null,
          fechaNacimiento: fechaNacimiento ? new Date(fechaNacimiento) : null,
        },
        include: { usuario: { select: { id: true, email: true } } },
      });
    });

    // Devolver las credenciales generadas — el frontend las muestra una sola vez
    res.status(201).json({
      cliente,
      credenciales: { email, passwordTemporal },
    });
  }
);

// PUT /api/clientes/:id — solo admin
router.put(
  "/:id",
  autenticar,
  autorizar("ADMIN"),
  async (req: AuthRequest, res: Response) => {
    const id = Number(req.params.id);
    const { nombres, apellidos, dpi, nit, telefono, direccion, fechaNacimiento } = req.body;

    if (!nombres?.trim() || !apellidos?.trim()) {
      res.status(400).json({ error: "Nombres y apellidos son obligatorios" });
      return;
    }

    if (dpi?.trim()) {
      const otro = await prisma.cliente.findUnique({ where: { dpi: dpi.trim() } });
      if (otro && otro.id !== id) {
        res.status(409).json({ error: "Ya existe un cliente con ese DPI" });
        return;
      }
    }

    const cliente = await prisma.cliente.update({
      where: { id },
      data: {
        nombres: nombres.trim(),
        apellidos: apellidos.trim(),
        dpi: dpi?.trim() || null,
        nit: nit?.trim() || null,
        telefono: telefono?.trim() || null,
        direccion: direccion?.trim() || null,
        fechaNacimiento: fechaNacimiento ? new Date(fechaNacimiento) : null,
      },
    });
    res.json(cliente);
  }
);

// DELETE /api/clientes/:id — soft delete (desactiva el usuario asociado)
router.delete(
  "/:id",
  autenticar,
  autorizar("ADMIN"),
  async (req: AuthRequest, res: Response) => {
    const cliente = await prisma.cliente.findUnique({
      where: { id: Number(req.params.id) },
    });
    if (!cliente) {
      res.status(404).json({ error: "Cliente no encontrado" });
      return;
    }
    await prisma.usuario.update({
      where: { id: cliente.usuarioId },
      data: { activo: false },
    });
    res.status(204).send();
  }
);

export default router;

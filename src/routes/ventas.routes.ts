import { Router, Response } from "express";
import { prisma } from "../lib/prisma";
import { autenticar, autorizar, AuthRequest } from "../middlewares/auth.middleware";
import { MetodoPago } from "../../generated/prisma/enums";

const router = Router();

// GET /api/ventas — admin ve todas, farmacéutico ve las suyas
router.get(
  "/",
  autenticar,
  autorizar("ADMIN", "FARMACEUTICO"),
  async (req: AuthRequest, res: Response) => {
    const where =
      req.user?.rol === "FARMACEUTICO"
        ? { farmaceuticoId: req.user.id }
        : {};

    const ventas = await prisma.venta.findMany({
      where,
      include: {
        farmaceutico: { select: { email: true } },
        cliente: { select: { nombres: true, apellidos: true } },
        detalles: { include: { lote: { include: { producto: true } } } },
      },
      orderBy: { fecha: "desc" },
    });
    res.json(ventas);
  }
);

// POST /api/ventas — registrar una venta
router.post(
  "/",
  autenticar,
  autorizar("ADMIN", "FARMACEUTICO"),
  async (req: AuthRequest, res: Response) => {
    const { clienteId, recetaId, metodoPago, items } = req.body;
    // items: [{ loteId, cantidad }] — el precio se toma del producto en BD, nunca del cliente.

    if (!items || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: "La venta debe tener al menos un ítem" });
      return;
    }

    // Validar cada ítem antes de tocar la BD
    for (const item of items) {
      const cantidad = Number(item.cantidad);
      if (!Number.isInteger(cantidad) || cantidad <= 0) {
        res.status(400).json({ error: "La cantidad de cada ítem debe ser un entero mayor a 0" });
        return;
      }
      if (!Number.isInteger(Number(item.loteId))) {
        res.status(400).json({ error: "loteId inválido" });
        return;
      }
    }

    const metodoPagoValido: MetodoPago =
      Object.values(MetodoPago).includes(metodoPago)
        ? metodoPago
        : MetodoPago.EFECTIVO;

    // Calcular total y verificar stock en transacción
    const venta = await prisma.$transaction(async (tx) => {
      let total = 0;
      const detalles = [];

      for (const item of items) {
        const cantidad = Number(item.cantidad);
        const lote = await tx.lote.findUnique({
          where: { id: Number(item.loteId) },
          include: { producto: true },
        });
        if (!lote) throw new Error(`Lote ${item.loteId} no encontrado`);
        if (lote.cantidadActual < cantidad) {
          throw new Error(
            `Stock insuficiente en lote ${item.loteId}: disponible ${lote.cantidadActual}`
          );
        }

        // El precio unitario SIEMPRE proviene del producto en BD, no del cliente.
        const precioUnit = Number(lote.producto.precioVenta);
        const subtotal = precioUnit * cantidad;
        total += subtotal;
        detalles.push({ loteId: lote.id, cantidad, precioUnit, subtotal });

        // Descontar stock
        await tx.lote.update({
          where: { id: lote.id },
          data: { cantidadActual: { decrement: cantidad } },
        });
      }

      const nuevaVenta = await tx.venta.create({
        data: {
          farmaceuticoId: req.user!.id,
          clienteId: clienteId ? Number(clienteId) : undefined,
          recetaId: recetaId ? Number(recetaId) : undefined,
          metodoPago: metodoPagoValido,
          total,
          detalles: { create: detalles },
        },
        include: { detalles: true },
      });

      return nuevaVenta;
    });

    res.status(201).json(venta);
  }
);

// PATCH /api/ventas/:id/anular — solo admin.
// Anula una venta COMPLETADA y devuelve el stock a los lotes.
router.patch(
  "/:id/anular",
  autenticar,
  autorizar("ADMIN"),
  async (req: AuthRequest, res: Response) => {
    const id = Number(req.params.id);
    const { motivo } = req.body ?? {};

    const venta = await prisma.venta.findUnique({
      where: { id },
      include: { detalles: true },
    });

    if (!venta) {
      res.status(404).json({ error: "Venta no encontrada" });
      return;
    }
    if (venta.estado === "ANULADA") {
      res.status(400).json({ error: "La venta ya está anulada" });
      return;
    }

    await prisma.$transaction(async (tx) => {
      // Devolver el stock vendido a cada lote
      for (const d of venta.detalles) {
        await tx.lote.update({
          where: { id: d.loteId },
          data: { cantidadActual: { increment: d.cantidad } },
        });
      }
      await tx.venta.update({
        where: { id },
        data: {
          estado: "ANULADA",
          observacion: motivo?.trim() || venta.observacion,
        },
      });
    });

    res.json({ id, estado: "ANULADA" });
  }
);

export default router;

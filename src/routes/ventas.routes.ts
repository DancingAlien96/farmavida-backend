import { Router, Response } from "express";
import { prisma } from "../lib/prisma";
import { autenticar, autorizar, AuthRequest } from "../middlewares/auth.middleware";
import { MetodoPago } from "../../generated/prisma/enums";
import { notificarVenta, notificarStockBajo } from "../lib/notificaciones";
import { descontarStock, devolverStock } from "../lib/stock";
import { ErrorNegocio } from "../lib/errores";

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
        detalles: { include: { producto: true } },
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
    // items: [{ productoId, cantidad }] — el precio se toma del producto en BD, nunca del cliente.

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
      if (!Number.isInteger(Number(item.productoId))) {
        res.status(400).json({ error: "productoId inválido" });
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
        const producto = await tx.producto.findUnique({
          where: { id: Number(item.productoId) },
          include: { unidadesVenta: true },
        });
        if (!producto) throw new ErrorNegocio(`Producto ${item.productoId} no encontrado`, 404);

        // Resuelve la forma de venta. Sin `unidadVentaId` se vende la unidad base.
        // El nombre, la equivalencia y el precio SIEMPRE salen de la BD.
        let unidadNombre = producto.unidadBase;
        let unidadEquivale = 1;
        let precioUnit = Number(producto.precioVenta);

        if (item.unidadVentaId) {
          const unidad = producto.unidadesVenta.find(
            (u) => u.id === Number(item.unidadVentaId)
          );
          if (!unidad) {
            throw new ErrorNegocio(`La forma de venta elegida no existe para "${producto.nombre}"`);
          }
          unidadNombre = unidad.nombre;
          unidadEquivale = unidad.equivale;
          precioUnit = Number(unidad.precio);
        }

        const subtotal = precioUnit * cantidad;
        total += subtotal;
        detalles.push({
          productoId: producto.id,
          unidadNombre,
          unidadEquivale,
          cantidad,
          precioUnit,
          subtotal,
        });

        // Descuenta FIFO en unidades BASE: 2 blísters de 10 = 20 pastillas.
        await descontarStock(
          tx,
          producto.id,
          cantidad * unidadEquivale,
          producto.nombre
        );
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

    // Notificaciones por correo — en segundo plano, después de responder.
    // Nunca deben afectar el resultado de la venta.
    const productoIds = venta.detalles.map((d) => d.productoId);
    notificarVenta(venta.id).catch(() => {});
    notificarStockBajo(productoIds).catch(() => {});
  }
);

// PATCH /api/ventas/:id/anular — solo admin.
// Anula una venta y devuelve el stock al producto.
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
      // Devolver el stock vendido: vuelve a la entrada de la que salió.
      // Se reintegra en unidades BASE (2 blísters de 10 → 20 pastillas).
      for (const d of venta.detalles) {
        await devolverStock(tx, d.productoId, d.cantidad * d.unidadEquivale);
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

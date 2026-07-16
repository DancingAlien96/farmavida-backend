import { Prisma } from "../../generated/prisma/client";
import { ErrorNegocio } from "./errores";

/**
 * Manejo de stock por entradas.
 *
 * Un producto puede tener varias entradas (cada compra crea una) con fechas de
 * vencimiento distintas. `Producto.stock` y `Producto.fechaVencimiento` NO se
 * escriben a mano: se derivan de las entradas con `sincronizarProducto`.
 * Así el resto del sistema (y todo el frontend) sigue leyendo esos dos campos
 * como siempre, sin enterarse de las entradas.
 */

type Tx = Prisma.TransactionClient;

/**
 * Recalcula el stock total y el vencimiento más próximo de un producto
 * a partir de sus entradas disponibles. Llamar después de cualquier
 * movimiento (compra, venta, anulación).
 */
export async function sincronizarProducto(tx: Tx, productoId: number): Promise<void> {
  const entradas = await tx.entradaStock.findMany({
    where: { productoId, cantidad: { gt: 0 } },
    orderBy: { fechaVencimiento: "asc" }, // en Postgres los NULL quedan al final
  });

  const stock = entradas.reduce((acc, e) => acc + e.cantidad, 0);
  const proximoVencimiento = entradas.find((e) => e.fechaVencimiento)?.fechaVencimiento ?? null;

  await tx.producto.update({
    where: { id: productoId },
    data: { stock, fechaVencimiento: proximoVencimiento },
  });
}

/**
 * Descuenta unidades siguiendo FIFO por vencimiento: sale primero lo que
 * vence antes (y al final lo que no tiene fecha). Lanza si no alcanza.
 */
export async function descontarStock(
  tx: Tx,
  productoId: number,
  cantidad: number,
  nombreProducto: string
): Promise<void> {
  const entradas = await tx.entradaStock.findMany({
    where: { productoId, cantidad: { gt: 0 } },
    orderBy: [{ fechaVencimiento: "asc" }, { id: "asc" }],
  });

  const disponible = entradas.reduce((acc, e) => acc + e.cantidad, 0);
  if (disponible < cantidad) {
    throw new ErrorNegocio(`Stock insuficiente de "${nombreProducto}": disponible ${disponible}`);
  }

  let restante = cantidad;
  for (const entrada of entradas) {
    if (restante === 0) break;
    const tomar = Math.min(entrada.cantidad, restante);
    await tx.entradaStock.update({
      where: { id: entrada.id },
      data: { cantidad: { decrement: tomar } },
    });
    restante -= tomar;
  }

  await sincronizarProducto(tx, productoId);
}

/**
 * Devuelve unidades al stock (al anular una venta). Las reintegra a la entrada
 * que vence primero —que es de donde salieron— o crea una si ya no queda ninguna.
 */
export async function devolverStock(
  tx: Tx,
  productoId: number,
  cantidad: number
): Promise<void> {
  const entrada = await tx.entradaStock.findFirst({
    where: { productoId },
    orderBy: [{ fechaVencimiento: "asc" }, { id: "asc" }],
  });

  if (entrada) {
    await tx.entradaStock.update({
      where: { id: entrada.id },
      data: { cantidad: { increment: cantidad } },
    });
  } else {
    await tx.entradaStock.create({
      data: { productoId, cantidad, fechaVencimiento: null },
    });
  }

  await sincronizarProducto(tx, productoId);
}

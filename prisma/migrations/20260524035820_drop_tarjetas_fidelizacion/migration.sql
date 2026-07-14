/*
  Warnings:

  - You are about to drop the `movimientos_puntos` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `tarjetas_fidelizacion` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "movimientos_puntos" DROP CONSTRAINT "movimientos_puntos_tarjeta_id_fkey";

-- DropForeignKey
ALTER TABLE "movimientos_puntos" DROP CONSTRAINT "movimientos_puntos_venta_id_fkey";

-- DropForeignKey
ALTER TABLE "tarjetas_fidelizacion" DROP CONSTRAINT "tarjetas_fidelizacion_cliente_id_fkey";

-- DropTable
DROP TABLE "movimientos_puntos";

-- DropTable
DROP TABLE "tarjetas_fidelizacion";

-- DropEnum
DROP TYPE "EstadoTarjeta";

-- DropEnum
DROP TYPE "TipoMovimiento";

-- CreateEnum
CREATE TYPE "EstadoTarjeta" AS ENUM ('ACTIVA', 'BLOQUEADA', 'VENCIDA');

-- CreateEnum
CREATE TYPE "TipoMovimiento" AS ENUM ('GANANCIA', 'CANJE');

-- CreateTable
CREATE TABLE "tarjetas_fidelizacion" (
    "id" SERIAL NOT NULL,
    "cliente_id" INTEGER NOT NULL,
    "nro_tarjeta" TEXT NOT NULL,
    "puntos_acumulados" INTEGER NOT NULL DEFAULT 0,
    "puntos_canjeados" INTEGER NOT NULL DEFAULT 0,
    "precio_pagado" DECIMAL(10,2) NOT NULL,
    "estado" "EstadoTarjeta" NOT NULL DEFAULT 'ACTIVA',
    "fecha_compra" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_vencimiento" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tarjetas_fidelizacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimientos_puntos" (
    "id" SERIAL NOT NULL,
    "tarjeta_id" INTEGER NOT NULL,
    "venta_id" INTEGER,
    "tipo" "TipoMovimiento" NOT NULL,
    "puntos" INTEGER NOT NULL,
    "descripcion" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimientos_puntos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tarjetas_fidelizacion_cliente_id_key" ON "tarjetas_fidelizacion"("cliente_id");

-- CreateIndex
CREATE UNIQUE INDEX "tarjetas_fidelizacion_nro_tarjeta_key" ON "tarjetas_fidelizacion"("nro_tarjeta");

-- AddForeignKey
ALTER TABLE "tarjetas_fidelizacion" ADD CONSTRAINT "tarjetas_fidelizacion_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_puntos" ADD CONSTRAINT "movimientos_puntos_tarjeta_id_fkey" FOREIGN KEY ("tarjeta_id") REFERENCES "tarjetas_fidelizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_puntos" ADD CONSTRAINT "movimientos_puntos_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

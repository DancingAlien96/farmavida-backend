-- Formas de venta: unidad / blíster / caja.
-- El stock sigue contándose en la unidad base del producto.

-- 1) Unidad base del producto (lo que cuenta el stock). Los productos que ya
--    existen quedan con "Unidad", que es justo como se comportaban.
ALTER TABLE "productos" ADD COLUMN "unidad_base" TEXT NOT NULL DEFAULT 'Unidad';

-- 2) Formas extra de venta (un producto puede no tener ninguna)
CREATE TABLE "unidades_venta" (
    "id" SERIAL NOT NULL,
    "producto_id" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "equivale" INTEGER NOT NULL,
    "precio" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "unidades_venta_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "unidades_venta_producto_id_nombre_key" ON "unidades_venta"("producto_id", "nombre");

ALTER TABLE "unidades_venta" ADD CONSTRAINT "unidades_venta_producto_id_fkey"
    FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3) El historial guarda en qué forma se vendió/compró.
--    Lo ya registrado fue en unidades sueltas → equivale 1.
ALTER TABLE "detalle_ventas" ADD COLUMN "unidad_nombre" TEXT NOT NULL DEFAULT 'Unidad';
ALTER TABLE "detalle_ventas" ADD COLUMN "unidad_equivale" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "detalle_compras" ADD COLUMN "unidad_nombre" TEXT NOT NULL DEFAULT 'Unidad';
ALTER TABLE "detalle_compras" ADD COLUMN "unidad_equivale" INTEGER NOT NULL DEFAULT 1;

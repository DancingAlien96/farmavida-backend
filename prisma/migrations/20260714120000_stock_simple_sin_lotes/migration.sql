-- Elimina el concepto de lote: el producto pasa a tener un stock simple y
-- una fecha de vencimiento. Preserva los datos existentes antes de borrar.

-- 1) Nuevas columnas en productos
ALTER TABLE "productos" ADD COLUMN "stock" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "productos" ADD COLUMN "fecha_vencimiento" TIMESTAMP(3);

-- 2) Stock = suma de las cantidades de sus lotes
UPDATE "productos" p
SET "stock" = COALESCE(
  (SELECT SUM(l."cantidad_actual") FROM "lotes" l WHERE l."producto_id" = p."id"),
  0
);

-- 3) Vencimiento = el más próximo entre los lotes con stock; si no hay, el más próximo de todos
UPDATE "productos" p
SET "fecha_vencimiento" = COALESCE(
  (SELECT MIN(l."fecha_vencimiento") FROM "lotes" l WHERE l."producto_id" = p."id" AND l."cantidad_actual" > 0),
  (SELECT MIN(l."fecha_vencimiento") FROM "lotes" l WHERE l."producto_id" = p."id")
);

-- 4) detalle_ventas: pasar de lote_id a producto_id (preservando el histórico)
ALTER TABLE "detalle_ventas" ADD COLUMN "producto_id" INTEGER;
UPDATE "detalle_ventas" d
SET "producto_id" = (SELECT l."producto_id" FROM "lotes" l WHERE l."id" = d."lote_id");
DELETE FROM "detalle_ventas" WHERE "producto_id" IS NULL;
ALTER TABLE "detalle_ventas" ALTER COLUMN "producto_id" SET NOT NULL;
ALTER TABLE "detalle_ventas" DROP CONSTRAINT "detalle_ventas_lote_id_fkey";
ALTER TABLE "detalle_ventas" DROP COLUMN "lote_id";
ALTER TABLE "detalle_ventas" ADD CONSTRAINT "detalle_ventas_producto_id_fkey"
  FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 5) detalle_compras: pasar de lote_id a producto_id
ALTER TABLE "detalle_compras" ADD COLUMN "producto_id" INTEGER;
UPDATE "detalle_compras" d
SET "producto_id" = (SELECT l."producto_id" FROM "lotes" l WHERE l."id" = d."lote_id");
DELETE FROM "detalle_compras" WHERE "producto_id" IS NULL;
ALTER TABLE "detalle_compras" ALTER COLUMN "producto_id" SET NOT NULL;
ALTER TABLE "detalle_compras" DROP CONSTRAINT "detalle_compras_lote_id_fkey";
ALTER TABLE "detalle_compras" DROP COLUMN "lote_id";
ALTER TABLE "detalle_compras" ADD CONSTRAINT "detalle_compras_producto_id_fkey"
  FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 6) Ya no se necesita la tabla de lotes
DROP TABLE "lotes";

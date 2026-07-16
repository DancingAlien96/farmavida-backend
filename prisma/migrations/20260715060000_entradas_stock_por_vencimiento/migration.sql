-- Entradas de stock: permite que un mismo producto tenga unidades con
-- fechas de vencimiento distintas. Es interna (el usuario nunca la ve).

CREATE TABLE "entradas_stock" (
    "id" SERIAL NOT NULL,
    "producto_id" INTEGER NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "fecha_vencimiento" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entradas_stock_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "entradas_stock" ADD CONSTRAINT "entradas_stock_producto_id_fkey"
    FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Enlace de cada item de compra con la entrada que generó (para poder anularla)
ALTER TABLE "detalle_compras" ADD COLUMN "entrada_id" INTEGER;
CREATE UNIQUE INDEX "detalle_compras_entrada_id_key" ON "detalle_compras"("entrada_id");
ALTER TABLE "detalle_compras" ADD CONSTRAINT "detalle_compras_entrada_id_fkey"
    FOREIGN KEY ("entrada_id") REFERENCES "entradas_stock"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: el stock que ya existe se convierte en una entrada por producto,
-- conservando su fecha de vencimiento actual. Así no se pierde nada.
INSERT INTO "entradas_stock" ("producto_id", "cantidad", "fecha_vencimiento")
SELECT "id", "stock", "fecha_vencimiento"
FROM "productos"
WHERE "stock" > 0;

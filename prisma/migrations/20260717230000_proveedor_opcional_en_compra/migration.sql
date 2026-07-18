-- El proveedor deja de ser obligatorio en una compra: se compra a fuentes
-- variadas que no siempre están registradas como proveedor.
ALTER TABLE "compras" DROP CONSTRAINT "compras_proveedor_id_fkey";
ALTER TABLE "compras" ALTER COLUMN "proveedor_id" DROP NOT NULL;
ALTER TABLE "compras" ADD CONSTRAINT "compras_proveedor_id_fkey"
  FOREIGN KEY ("proveedor_id") REFERENCES "proveedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

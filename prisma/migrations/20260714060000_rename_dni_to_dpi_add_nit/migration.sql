-- Renombra la columna dni -> dpi (Documento Personal de Identificación, Guatemala)
-- preservando los datos existentes, y agrega el campo nit.
ALTER TABLE "clientes" RENAME COLUMN "dni" TO "dpi";
ALTER INDEX "clientes_dni_key" RENAME TO "clientes_dpi_key";
ALTER TABLE "clientes" ADD COLUMN "nit" TEXT;

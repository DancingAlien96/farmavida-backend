-- DropForeignKey
ALTER TABLE "productos" DROP CONSTRAINT "productos_categoria_id_fkey";

-- AlterTable
ALTER TABLE "productos" ALTER COLUMN "categoria_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "productos" ADD CONSTRAINT "productos_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

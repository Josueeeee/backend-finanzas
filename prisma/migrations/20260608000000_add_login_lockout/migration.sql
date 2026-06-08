-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN "loginIntentos" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Usuario" ADD COLUMN "bloqueadoHasta" TIMESTAMP(3);

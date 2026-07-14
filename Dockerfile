# ─────────────────────────────────────────────────────────────
# Etapa 1: build — compila TypeScript y genera el cliente Prisma
# ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

# Instala todas las dependencias (incluye dev, necesarias para compilar)
COPY package*.json ./
RUN npm ci

# Genera el cliente Prisma (crea /app/generated).
# prisma.config.ts exige DATABASE_URL al cargarse; en build usamos un valor
# temporal (generate no se conecta a la base de datos).
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" npx prisma generate

# Compila el código (src + generated → dist)
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ─────────────────────────────────────────────────────────────
# Etapa 2: runner — imagen final de producción
# ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copiamos dependencias ya instaladas (incluye la CLI de Prisma para migraciones)
COPY --from=builder /app/node_modules ./node_modules
# Artefactos compilados y archivos que necesita Prisma en runtime
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/package.json ./package.json

EXPOSE 3000

# Aplica migraciones pendientes y arranca el servidor
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/index.js"]

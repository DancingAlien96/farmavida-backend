# FarmaVida — Backend

API REST para el sistema de gestión de la farmacia FarmaVida.
**Stack:** Node.js + Express 5 + Prisma 7 + PostgreSQL 16 + JWT.

## Requisitos
- Node.js 22+ (para desarrollo local)
- Docker y Docker Compose (para producción)

## Variables de entorno
Copia la plantilla y completa los valores:

```bash
cp .env.example .env
```

| Variable | Descripción |
|----------|-------------|
| `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Credenciales de PostgreSQL |
| `DB_PORT` | Puerto de la BD para desarrollo local (por defecto 5433) |
| `DATABASE_URL` | Cadena de conexión de Prisma |
| `JWT_SECRET` | **Secreto para firmar los tokens — usa uno largo y aleatorio en producción** |
| `PORT` | Puerto del backend (por defecto 3000) |
| `SMTP_USER`, `SMTP_PASS`, `NOTIFY_EMAIL` | Notificaciones por correo (opcional — ver abajo) |

## Notificaciones por correo (opcional)

La dueña puede recibir avisos automáticos por correo. Se envían desde el Gmail de
la farmacia usando una **contraseña de aplicación** (no la contraseña normal).

**Cómo obtener la clave:**
1. Activa la verificación en 2 pasos en la cuenta: <https://myaccount.google.com/signinoptions/twosv>
2. Genera una contraseña de aplicación: <https://myaccount.google.com/apppasswords>
3. Pégala en `.env` (sin espacios):

```bash
SMTP_USER=farmavida@gmail.com     # correo que ENVÍA
SMTP_PASS=abcdefghijklmnop        # contraseña de aplicación (16 caracteres)
NOTIFY_EMAIL=duena@ejemplo.com    # correo que RECIBE los avisos
```

**Qué se notifica:**

| Aviso | Cuándo |
|-------|--------|
| Cada venta registrada | Al momento de cobrar |
| Alerta de stock bajo | Al vender, si un producto queda en o bajo su umbral |
| Resumen diario de ventas | Todos los días a las 8:00 PM |
| Productos por vencer | Los lunes a las 8:00 AM (próximos 30 días) |

**Probar la configuración** (como admin):

```bash
curl -X POST http://localhost:3000/api/notificaciones/prueba \
  -H "Authorization: Bearer <TOKEN_DE_ADMIN>"
```

> Si las variables se dejan vacías, el sistema simplemente no envía correos y todo
> lo demás funciona igual. Un fallo de correo nunca afecta una venta.

## Desarrollo local

```bash
npm install
docker compose up -d          # levanta solo PostgreSQL (puerto 5433)
npm run prisma:migrate        # aplica migraciones
npm run seed                  # crea usuarios admin y farmacéutico
npm run dev                   # servidor con recarga en caliente
```

Usuarios que crea el seed:
- `admin@farmavida.com` / `Admin123!` (ADMIN)
- `farmaceutico@farmavida.com` / `Farma123!` (FARMACEUTICO)

## Producción con Docker

Levanta la base de datos y el backend juntos:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Esto:
1. Levanta PostgreSQL con un volumen persistente (`farmavida_pgdata`).
2. Compila el backend y **aplica las migraciones automáticamente** al arrancar.
3. Expone la API en `http://localhost:3000` (health check en `/health`).

**Primer despliegue** — crea los usuarios iniciales y todas las categorías (una sola vez):

```bash
docker compose -f docker-compose.prod.yml exec backend npm run seed:prod
```

Deja la base lista con: 2 usuarios (admin + farmacéutico) y el árbol completo de
categorías. Sin productos, clientes, proveedores ni ventas (es idempotente: puedes
volver a correrlo sin duplicar).

### Comandos útiles

```bash
docker compose -f docker-compose.prod.yml logs -f backend   # ver logs
docker compose -f docker-compose.prod.yml down              # detener
docker compose -f docker-compose.prod.yml down -v           # detener y borrar la BD
```

## Notas de seguridad para producción
- Cambia `JWT_SECRET` por un valor largo y aleatorio.
- La base de datos **no se expone al host**; solo la usa el backend por la red interna de Docker.
- Considera restringir CORS a los orígenes reales del frontend antes de exponer la API a internet.

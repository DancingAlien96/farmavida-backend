import "dotenv/config";
import express from "express";
import cors from "cors";
import cron from "node-cron";
import { verificarCorreo } from "./lib/mailer";
import { ErrorNegocio } from "./lib/errores";
import { notificarResumenDiario, notificarPorVencer } from "./lib/notificaciones";

import authRoutes from "./routes/auth.routes";
import productosRoutes from "./routes/productos.routes";
import ventasRoutes from "./routes/ventas.routes";
import catalogoRoutes from "./routes/catalogo.routes";
import usuariosRoutes from "./routes/usuarios.routes";
import laboratoriosRoutes from "./routes/laboratorios.routes";
import proveedoresRoutes from "./routes/proveedores.routes";
import comprasRoutes from "./routes/compras.routes";
import clientesRoutes from "./routes/clientes.routes";
import notificacionesRoutes from "./routes/notificaciones.routes";

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares globales
app.use(cors());
app.use(express.json());

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Rutas
app.use("/api/auth", authRoutes);
app.use("/api/productos", productosRoutes);
app.use("/api/ventas", ventasRoutes);
app.use("/api/categorias", catalogoRoutes);
app.use("/api/usuarios", usuariosRoutes);
app.use("/api/laboratorios", laboratoriosRoutes);
app.use("/api/proveedores", proveedoresRoutes);
app.use("/api/compras", comprasRoutes);
app.use("/api/clientes", clientesRoutes);
app.use("/api/notificaciones", notificacionesRoutes);

// Error handler genérico.
// Solo los errores de negocio muestran su mensaje al usuario; el resto se
// registra en el servidor y devuelve un texto genérico, para no filtrar
// detalles internos (rutas de archivos, SQL, etc.).
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    if (err instanceof ErrorNegocio) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    console.error("[ERROR]", err);
    res.status(500).json({ error: "Ocurrió un error inesperado. Intenta de nuevo." });
  }
);

app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
  verificarCorreo();
});

// ─── Tareas programadas (zona horaria de Guatemala) ──────────────────────────
const TZ = { timezone: "America/Guatemala" };

// Resumen diario de ventas — todos los días a las 8:00 PM
cron.schedule("0 20 * * *", () => {
  console.log("[CRON] Enviando resumen diario...");
  notificarResumenDiario().catch((e) => console.error("[CRON] resumen:", e.message));
}, TZ);

// Productos próximos a vencer — todos los lunes a las 8:00 AM
cron.schedule("0 8 * * 1", () => {
  console.log("[CRON] Revisando productos por vencer...");
  notificarPorVencer(30).catch((e) => console.error("[CRON] por vencer:", e.message));
}, TZ);

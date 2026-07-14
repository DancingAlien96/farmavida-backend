import "dotenv/config";
import express from "express";
import cors from "cors";

import authRoutes from "./routes/auth.routes";
import productosRoutes from "./routes/productos.routes";
import ventasRoutes from "./routes/ventas.routes";
import catalogoRoutes from "./routes/catalogo.routes";
import usuariosRoutes from "./routes/usuarios.routes";
import laboratoriosRoutes from "./routes/laboratorios.routes";
import proveedoresRoutes from "./routes/proveedores.routes";
import comprasRoutes from "./routes/compras.routes";
import clientesRoutes from "./routes/clientes.routes";

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

// Error handler genérico
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error(err.message);
    res.status(500).json({ error: err.message || "Error interno del servidor" });
  }
);

app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});

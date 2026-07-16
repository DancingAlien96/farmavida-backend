import { Router, Response } from "express";
import { prisma } from "../lib/prisma";
import { autenticar, autorizar, AuthRequest } from "../middlewares/auth.middleware";

const router = Router();

interface UnidadVentaInput {
  nombre?: string;
  equivale?: number | string;
  precio?: number | string;
}

/**
 * Valida y normaliza las formas extra de venta (Blíster, Caja...).
 * Devuelve un error legible o la lista lista para guardar.
 */
function validarUnidades(
  unidades: unknown
): { error: string } | { data: { nombre: string; equivale: number; precio: number }[] } {
  if (unidades === undefined || unidades === null) return { data: [] };
  if (!Array.isArray(unidades)) {
    return { error: "Las formas de venta deben ser una lista" };
  }

  const vistos = new Set<string>();
  const data: { nombre: string; equivale: number; precio: number }[] = [];

  for (const [i, u] of (unidades as UnidadVentaInput[]).entries()) {
    const nombre = String(u?.nombre ?? "").trim();
    const equivale = Number(u?.equivale);
    const precio = Number(u?.precio);

    if (!nombre) return { error: `Forma de venta #${i + 1}: falta el nombre` };
    if (!Number.isInteger(equivale) || equivale < 2) {
      return {
        error: `Forma de venta "${nombre}": debe equivaler a 2 o más unidades base (si equivale a 1, ya es la unidad base)`,
      };
    }
    if (!Number.isFinite(precio) || precio < 0) {
      return { error: `Forma de venta "${nombre}": el precio no es válido` };
    }
    const clave = nombre.toLowerCase();
    if (vistos.has(clave)) return { error: `Forma de venta "${nombre}": está repetida` };
    vistos.add(clave);

    data.push({ nombre, equivale, precio });
  }
  return { data };
}

/**
 * Convierte texto vacío a null. Importante para los campos opcionales únicos:
 * guardar "" haría que dos productos sin código de barras choquen entre sí.
 */
const limpiar = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
  return s === "" ? null : s;
};

const INCLUDE_PRODUCTO = {
  categoria: true,
  laboratorio: true,
  unidadesVenta: { orderBy: { equivale: "asc" } },
} as const;

// GET /api/productos
router.get("/", async (_req, res: Response) => {
  const productos = await prisma.producto.findMany({
    where: { activo: true },
    include: INCLUDE_PRODUCTO,
    orderBy: { nombre: "asc" },
  });
  res.json(productos);
});

// GET /api/productos/:id
router.get("/:id", async (req, res: Response) => {
  const producto = await prisma.producto.findUnique({
    where: { id: Number(req.params.id) },
    include: INCLUDE_PRODUCTO,
  });

  if (!producto) {
    res.status(404).json({ error: "Producto no encontrado" });
    return;
  }
  res.json(producto);
});

// POST /api/productos — solo admin
router.post(
  "/",
  autenticar,
  autorizar("ADMIN"),
  async (req: AuthRequest, res: Response) => {
    // Nota: `fechaVencimiento` NO se acepta aquí. Se calcula a partir de las
    // entradas de stock que crean las compras (ver lib/stock.ts).
    const {
      nombre, codigoBarras, descripcion, imagen, presentacion,
      concentracion, unidadBase, precioVenta, stock, stockMinimo,
      requiereReceta, categoriaId, laboratorioId, unidadesVenta,
    } = req.body;

    // La categoría es opcional; solo nombre y precio son obligatorios.
    if (!nombre || !precioVenta) {
      res.status(400).json({ error: "El nombre y el precio de venta son obligatorios" });
      return;
    }

    if (stock !== undefined && (!Number.isInteger(Number(stock)) || Number(stock) < 0)) {
      res.status(400).json({ error: "El stock debe ser un número entero mayor o igual a 0" });
      return;
    }

    const unidades = validarUnidades(unidadesVenta);
    if ("error" in unidades) {
      res.status(400).json({ error: unidades.error });
      return;
    }

    // El código de barras es opcional y único: si viene vacío debe guardarse
    // como null, si no, dos productos sin código chocarían entre sí.
    const codigo = limpiar(codigoBarras);
    if (codigo) {
      const repetido = await prisma.producto.findUnique({ where: { codigoBarras: codigo } });
      if (repetido) {
        res.status(409).json({
          error: `Ya existe un producto con el código de barras ${codigo}: "${repetido.nombre}"`,
        });
        return;
      }
    }

    const producto = await prisma.producto.create({
      data: {
        nombre: String(nombre).trim(),
        codigoBarras: codigo,
        descripcion: limpiar(descripcion),
        imagen: limpiar(imagen),
        presentacion: limpiar(presentacion),
        concentracion: limpiar(concentracion),
        unidadBase: limpiar(unidadBase) ?? "Unidad",
        precioVenta,
        stock: stock !== undefined ? Number(stock) : 0,
        stockMinimo,
        requiereReceta,
        categoriaId: categoriaId ? Number(categoriaId) : null,
        laboratorioId: laboratorioId ? Number(laboratorioId) : null,
        unidadesVenta: { create: unidades.data },
      },
      include: INCLUDE_PRODUCTO,
    });
    res.status(201).json(producto);
  }
);

// PUT /api/productos/:id — solo admin
router.put(
  "/:id",
  autenticar,
  autorizar("ADMIN"),
  async (req: AuthRequest, res: Response) => {
    // Nota: `fechaVencimiento` NO es editable: se deriva de las entradas de stock.
    const {
      nombre, codigoBarras, descripcion, imagen, presentacion,
      concentracion, unidadBase, precioVenta, stock, stockMinimo,
      requiereReceta, categoriaId, laboratorioId, unidadesVenta,
    } = req.body;

    // Allow-list: solo estos campos son editables. Evita que el cliente
    // escriba columnas sensibles (activo, createdAt, etc.) vía mass assignment.
    const data: Record<string, unknown> = {};
    if (nombre !== undefined) data.nombre = String(nombre).trim();
    if (unidadBase !== undefined) data.unidadBase = limpiar(unidadBase) ?? "Unidad";
    if (codigoBarras !== undefined) data.codigoBarras = limpiar(codigoBarras);
    if (descripcion !== undefined) data.descripcion = limpiar(descripcion);
    if (imagen !== undefined) data.imagen = limpiar(imagen);
    if (presentacion !== undefined) data.presentacion = limpiar(presentacion);
    if (concentracion !== undefined) data.concentracion = limpiar(concentracion);
    if (precioVenta !== undefined) data.precioVenta = precioVenta;
    if (stockMinimo !== undefined) data.stockMinimo = stockMinimo;
    if (requiereReceta !== undefined) data.requiereReceta = requiereReceta;
    if (stock !== undefined) {
      if (!Number.isInteger(Number(stock)) || Number(stock) < 0) {
        res.status(400).json({ error: "El stock debe ser un número entero mayor o igual a 0" });
        return;
      }
      data.stock = Number(stock);
    }
    if (categoriaId !== undefined) {
      data.categoriaId = categoriaId ? Number(categoriaId) : null;
    }
    if (laboratorioId !== undefined) {
      data.laboratorioId = laboratorioId ? Number(laboratorioId) : null;
    }

    const id = Number(req.params.id);
    const existe = await prisma.producto.findUnique({ where: { id } });
    if (!existe) {
      res.status(404).json({ error: "Producto no encontrado" });
      return;
    }

    // El código de barras es único: avisar claro si ya lo tiene otro producto
    if (data.codigoBarras) {
      const otro = await prisma.producto.findUnique({
        where: { codigoBarras: data.codigoBarras as string },
      });
      if (otro && otro.id !== id) {
        res.status(409).json({
          error: `Ya existe un producto con el código de barras ${data.codigoBarras}: "${otro.nombre}"`,
        });
        return;
      }
    }

    // Si se envían formas de venta, reemplazan por completo a las anteriores.
    let unidades: { nombre: string; equivale: number; precio: number }[] | null = null;
    if (unidadesVenta !== undefined) {
      const validadas = validarUnidades(unidadesVenta);
      if ("error" in validadas) {
        res.status(400).json({ error: validadas.error });
        return;
      }
      unidades = validadas.data;
    }

    const producto = await prisma.$transaction(async (tx) => {
      if (unidades) {
        await tx.unidadVenta.deleteMany({ where: { productoId: id } });
        if (unidades.length > 0) {
          await tx.unidadVenta.createMany({
            data: unidades.map((u) => ({ ...u, productoId: id })),
          });
        }
      }
      return tx.producto.update({ where: { id }, data, include: INCLUDE_PRODUCTO });
    });

    res.json(producto);
  }
);

// DELETE /api/productos/:id — soft delete, solo admin
router.delete(
  "/:id",
  autenticar,
  autorizar("ADMIN"),
  async (req: AuthRequest, res: Response) => {
    await prisma.producto.update({
      where: { id: Number(req.params.id) },
      data: { activo: false },
    });
    res.status(204).send();
  }
);

export default router;

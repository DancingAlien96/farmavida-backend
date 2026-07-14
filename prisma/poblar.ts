import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const LABORATORIOS = ["Bayer", "Pfizer", "Genfar", "Bristol-Myers Squibb", "Grupo Lamfer"];

const METODOS = ["EFECTIVO", "TARJETA", "TRANSFERENCIA", "YAPE"] as const;

// nombre, categoría (debe existir), laboratorio, presentación, concentración,
// precioVenta, stockMinimo, requiereReceta, stockInicial
const PRODUCTOS: {
  nombre: string; cat: string; lab: string; pres: string; conc: string;
  precio: number; min: number; receta: boolean; stock: number;
}[] = [
  { nombre: "Acetaminofén 500mg", cat: "Analgésicos", lab: "Genfar", pres: "Tabletas", conc: "500mg", precio: 15.0, min: 20, receta: false, stock: 240 },
  { nombre: "Aspirina 100mg", cat: "Analgésicos", lab: "Bayer", pres: "Tabletas", conc: "100mg", precio: 12.0, min: 20, receta: false, stock: 180 },
  { nombre: "Ibuprofeno 400mg", cat: "Antiinflamatorios", lab: "Genfar", pres: "Tabletas", conc: "400mg", precio: 22.5, min: 15, receta: false, stock: 160 },
  { nombre: "Diclofenaco 50mg", cat: "Antiinflamatorios", lab: "Bayer", pres: "Tabletas", conc: "50mg", precio: 20.0, min: 15, receta: true, stock: 120 },
  { nombre: "Naproxeno 550mg", cat: "Antiinflamatorios", lab: "Pfizer", pres: "Tabletas", conc: "550mg", precio: 26.0, min: 15, receta: false, stock: 100 },
  { nombre: "Amoxicilina 500mg", cat: "Antibióticos", lab: "Genfar", pres: "Cápsulas", conc: "500mg", precio: 45.0, min: 12, receta: true, stock: 90 },
  { nombre: "Azitromicina 500mg", cat: "Antibióticos", lab: "Pfizer", pres: "Tabletas", conc: "500mg", precio: 60.0, min: 10, receta: true, stock: 70 },
  { nombre: "Loratadina 10mg", cat: "Antihistamínicos / Alergias", lab: "Genfar", pres: "Tabletas", conc: "10mg", precio: 18.0, min: 15, receta: false, stock: 140 },
  { nombre: "Cetirizina 10mg", cat: "Antihistamínicos / Alergias", lab: "Bayer", pres: "Tabletas", conc: "10mg", precio: 20.0, min: 15, receta: false, stock: 110 },
  { nombre: "Losartán 50mg", cat: "Cardiovascular", lab: "Pfizer", pres: "Tabletas", conc: "50mg", precio: 38.0, min: 12, receta: true, stock: 85 },
  { nombre: "Metformina 850mg", cat: "Cardiovascular", lab: "Genfar", pres: "Tabletas", conc: "850mg", precio: 28.0, min: 12, receta: true, stock: 95 },
  { nombre: "Alcohol en gel 250ml", cat: "Antisépticos", lab: "Grupo Lamfer", pres: "Frasco", conc: "250ml", precio: 18.0, min: 20, receta: false, stock: 130 },
  { nombre: "Crema hidratante 100g", cat: "Cremas y talcos", lab: "Grupo Lamfer", pres: "Tubo", conc: "100g", precio: 40.0, min: 10, receta: false, stock: 75 },
  { nombre: "Suero oral naranja", cat: "Alimentos especiales", lab: "Grupo Lamfer", pres: "Sobre", conc: "1L", precio: 8.0, min: 25, receta: false, stock: 200 },
  { nombre: "Termómetro digital", cat: "Accesorios", lab: "Grupo Lamfer", pres: "Unidad", conc: "—", precio: 75.0, min: 8, receta: false, stock: 45 },
  // Productos con stock bajo / agotado — para poblar las alertas del tablero
  { nombre: "Enalapril 10mg", cat: "Cardiovascular", lab: "Bristol-Myers Squibb", pres: "Tabletas", conc: "10mg", precio: 24.0, min: 15, receta: true, stock: 6 },
  { nombre: "Curitas caja x40", cat: "Accesorios", lab: "Grupo Lamfer", pres: "Caja", conc: "40 uds", precio: 15.0, min: 20, receta: false, stock: 8 },
  { nombre: "Agua oxigenada 120ml", cat: "Antisépticos", lab: "Grupo Lamfer", pres: "Frasco", conc: "120ml", precio: 10.0, min: 10, receta: false, stock: 0 },
];

const CLIENTES = [
  { nombres: "María", apellidos: "López García", dpi: "2547896540101", nit: "5478965", tel: "5541-2233" },
  { nombres: "Carlos", apellidos: "Ramírez Pérez", dpi: "1985632470102", nit: "1856324", tel: "4478-9911" },
  { nombres: "Ana", apellidos: "Gómez Solís", dpi: "3021547890103", nit: "3021547", tel: "5590-1122" },
  { nombres: "José", apellidos: "Morales Díaz", dpi: "2789541230104", nit: "2789541", tel: "4102-8877" },
  { nombres: "Lucía", apellidos: "Hernández Ruiz", dpi: "3145987620105", nit: "CF", tel: "5623-4400" },
  { nombres: "Pedro", apellidos: "Castillo Marroquín", dpi: "2098754310106", nit: "CF", tel: "4471-6655" },
];

const rnd = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = <T,>(arr: T[]) => arr[rnd(0, arr.length - 1)];

async function main() {
  console.log("🌱 Poblando el sistema...\n");

  // ── Laboratorios ────────────────────────────────────────────────────────────
  const labMap = new Map<string, number>();
  for (const nombre of LABORATORIOS) {
    const existe = await prisma.laboratorio.findUnique({ where: { nombre } });
    const lab = existe ?? (await prisma.laboratorio.create({ data: { nombre } }));
    labMap.set(nombre, lab.id);
  }
  console.log(`  ✅ Laboratorios listos (${labMap.size})`);

  // ── Categorías (deben existir) ───────────────────────────────────────────────
  const cats = await prisma.categoria.findMany();
  const catMap = new Map(cats.map((c) => [c.nombre, c.id]));
  const catFallback = cats[0]?.id;

  // ── Productos + lote inicial ──────────────────────────────────────────────────
  const sellables: { loteId: number; precio: number; remaining: number }[] = [];
  let creados = 0;
  for (const p of PRODUCTOS) {
    const yaExiste = await prisma.producto.findFirst({ where: { nombre: p.nombre } });
    if (yaExiste) {
      console.log(`  ⏭  Producto ya existe: ${p.nombre}`);
      continue;
    }
    const categoriaId = catMap.get(p.cat) ?? catFallback;
    const vencMeses = rnd(8, 26);
    const venc = new Date();
    venc.setMonth(venc.getMonth() + vencMeses);

    const producto = await prisma.producto.create({
      data: {
        nombre: p.nombre,
        presentacion: p.pres,
        concentracion: p.conc,
        precioVenta: p.precio,
        stockMinimo: p.min,
        requiereReceta: p.receta,
        categoriaId: categoriaId!,
        laboratorioId: labMap.get(p.lab),
        ...(p.stock > 0 && {
          lotes: {
            create: {
              nroLote: `LT-${new Date().getFullYear()}-${rnd(100, 999)}`,
              cantidadActual: p.stock,
              fechaVencimiento: venc,
              precioCosto: +(p.precio * 0.6).toFixed(2),
            },
          },
        }),
      },
      include: { lotes: true },
    });
    creados++;
    // Solo los productos con stock alto entran al pool de ventas (no los "bajos")
    if (p.stock >= 40 && producto.lotes[0]) {
      sellables.push({ loteId: producto.lotes[0].id, precio: p.precio, remaining: p.stock });
    }
  }
  console.log(`  ✅ Productos creados: ${creados} (${PRODUCTOS.length - creados} ya existían)`);

  // ── Clientes ──────────────────────────────────────────────────────────────────
  const clienteIds: number[] = [];
  const passwordHash = await bcrypt.hash("Cliente123!", 10);
  for (let i = 0; i < CLIENTES.length; i++) {
    const c = CLIENTES[i];
    const email = `cliente${i + 1}@farmavida.com`;
    const existe = await prisma.usuario.findUnique({
      where: { email },
      include: { cliente: true },
    });
    if (existe?.cliente) {
      clienteIds.push(existe.cliente.id);
      continue;
    }
    const usuario = await prisma.usuario.create({
      data: {
        email,
        passwordHash,
        rol: "CLIENTE",
        cliente: { create: { nombres: c.nombres, apellidos: c.apellidos, dpi: c.dpi, nit: c.nit, telefono: c.tel } },
      },
      include: { cliente: true },
    });
    if (usuario.cliente) clienteIds.push(usuario.cliente.id);
  }
  console.log(`  ✅ Clientes listos (${clienteIds.length})`);

  // ── Ventas de los últimos 14 días ─────────────────────────────────────────────
  const ventasExistentes = await prisma.venta.count();
  if (ventasExistentes > 0) {
    console.log(`  ⏭  Ya hay ${ventasExistentes} ventas — se omite la generación de ventas.`);
  } else if (sellables.length === 0) {
    console.log(`  ⚠  No hay productos con stock para vender.`);
  } else {
    const farmaceutico = await prisma.usuario.findUnique({
      where: { email: "farmaceutico@farmavida.com" },
    });
    const farmaceuticoId = farmaceutico?.id ?? 1;
    let totalVentas = 0;

    for (let diasAtras = 13; diasAtras >= 0; diasAtras--) {
      // Más ventas en días recientes; garantizamos ventas hoy (0) y ayer (1)
      const nVentas = diasAtras <= 1 ? rnd(3, 6) : rnd(1, 5);
      for (let k = 0; k < nVentas; k++) {
        const fecha = new Date();
        fecha.setDate(fecha.getDate() - diasAtras);
        fecha.setHours(rnd(8, 19), rnd(0, 59), rnd(0, 59), 0);

        const nItems = rnd(1, 3);
        const detalles: { loteId: number; cantidad: number; precioUnit: number; subtotal: number }[] = [];
        const usados = new Set<number>();
        let total = 0;

        for (let it = 0; it < nItems; it++) {
          const s = pick(sellables);
          if (usados.has(s.loteId) || s.remaining < 1) continue;
          const cantidad = Math.min(rnd(1, 4), s.remaining);
          if (cantidad < 1) continue;
          usados.add(s.loteId);
          s.remaining -= cantidad;
          const subtotal = +(s.precio * cantidad).toFixed(2);
          total += subtotal;
          detalles.push({ loteId: s.loteId, cantidad, precioUnit: s.precio, subtotal });
        }
        if (detalles.length === 0) continue;

        const conCliente = Math.random() < 0.6 && clienteIds.length > 0;
        await prisma.venta.create({
          data: {
            farmaceuticoId,
            clienteId: conCliente ? pick(clienteIds) : null,
            fecha,
            total: +total.toFixed(2),
            metodoPago: pick([...METODOS]),
            // estado por defecto: COMPLETADA
            detalles: { create: detalles },
          },
        });
        totalVentas++;
      }
    }

    // Actualizar el stock de los lotes según lo vendido
    for (const s of sellables) {
      await prisma.lote.update({
        where: { id: s.loteId },
        data: { cantidadActual: s.remaining },
      });
    }
    console.log(`  ✅ Ventas creadas: ${totalVentas}`);
  }

  console.log("\n🌱 ¡Poblado completado!");
}

main()
  .catch((e) => {
    console.error("❌ Error al poblar:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

type Rol = "ADMIN" | "FARMACEUTICO" | "CLIENTE";

const usuarios: { email: string; password: string; nombres: string; apellidos: string; rol: Rol }[] = [
  {
    email: "admin@farmavida.com",
    password: "Admin123!",
    nombres: "Administrador",
    apellidos: "FarmaVida",
    rol: "ADMIN",
  },
  {
    email: "farmaceutico@farmavida.com",
    password: "Farma123!",
    nombres: "Carlos",
    apellidos: "Mendoza",
    rol: "FARMACEUTICO",
  },
];

// Árbol de categorías de farmacia (raíz → subcategorías).
const categorias: { nombre: string; hijos: string[] }[] = [
  {
    nombre: "Medicamentos",
    hijos: [
      "Analgésicos", "Antibióticos", "Antiinflamatorios", "Antihistamínicos / Alergias",
      "Antipiréticos", "Digestivo / Antiácidos", "Respiratorio / Antitusivos",
      "Cardiovascular", "Diabetes", "Dermatológicos", "Oftalmológicos", "Vitaminas y suplementos",
    ],
  },
  {
    nombre: "Cuidado Personal",
    hijos: ["Higiene oral", "Higiene corporal", "Cuidado capilar", "Cuidado facial", "Desodorantes", "Protección solar"],
  },
  {
    nombre: "Cuidado del Bebé",
    hijos: ["Pañales", "Fórmulas lácteas", "Cremas y talcos", "Accesorios"],
  },
  {
    nombre: "Primeros Auxilios",
    hijos: ["Vendajes y gasas", "Antisépticos", "Curitas y apósitos", "Material de curación"],
  },
  {
    nombre: "Dispositivos Médicos",
    hijos: ["Termómetros", "Tensiómetros", "Glucómetros", "Mascarillas"],
  },
  {
    nombre: "Salud Sexual",
    hijos: ["Anticonceptivos", "Preservativos", "Pruebas de embarazo"],
  },
  {
    nombre: "Nutrición y Dietética",
    hijos: ["Suplementos deportivos", "Productos dietéticos", "Alimentos especiales"],
  },
];

async function main() {
  console.log("🌱 Iniciando seed...");

  for (const u of usuarios) {
    const existe = await prisma.usuario.findUnique({ where: { email: u.email } });

    if (existe) {
      console.log(`  ⏭  Usuario ya existe: ${u.email}`);
      continue;
    }

    const passwordHash = await bcrypt.hash(u.password, 10);
    const usuario = await prisma.usuario.create({
      data: {
        email: u.email,
        passwordHash,
        rol: u.rol,
        activo: true,
      },
    });

    // Para CLIENTE se crea el registro en la tabla clientes
    if (u.rol === "CLIENTE") {
      await prisma.cliente.create({
        data: {
          usuarioId: usuario.id,
          nombres: u.nombres,
          apellidos: u.apellidos,
        },
      });
    }

    console.log(`  ✅ Creado: ${u.email} (${u.rol}) — pass: ${u.password}`);
  }

  // Categorías (idempotente por nombre único)
  let creadas = 0;
  for (const raiz of categorias) {
    const padre = await prisma.categoria.upsert({
      where: { nombre: raiz.nombre },
      update: {},
      create: { nombre: raiz.nombre },
    });
    for (const hijo of raiz.hijos) {
      const res = await prisma.categoria.upsert({
        where: { nombre: hijo },
        update: {},
        create: { nombre: hijo, parentId: padre.id },
      });
      if (res) creadas++;
    }
  }
  console.log(`  ✅ Categorías listas (${categorias.length} raíces + ${creadas} subcategorías)`);

  console.log("🌱 Seed completado.");
}

main()
  .catch((e) => {
    console.error("❌ Error en seed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

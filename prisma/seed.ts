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

  console.log("🌱 Seed completado.");
}

main()
  .catch((e) => {
    console.error("❌ Error en seed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

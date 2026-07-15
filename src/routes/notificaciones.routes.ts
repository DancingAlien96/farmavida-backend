import { Router, Response } from "express";
import { autenticar, autorizar, AuthRequest } from "../middlewares/auth.middleware";
import { correoActivo, enviarCorreo, plantilla } from "../lib/mailer";
import { notificarResumenDiario, notificarPorVencer } from "../lib/notificaciones";

const router = Router();

// Todas las rutas requieren ADMIN
router.use(autenticar, autorizar("ADMIN"));

// GET /api/notificaciones/estado — ¿está configurado el correo?
router.get("/estado", async (_req: AuthRequest, res: Response) => {
  res.json({
    activo: correoActivo,
    destinatario: correoActivo ? process.env.NOTIFY_EMAIL : null,
  });
});

// POST /api/notificaciones/prueba — envía un correo de prueba
router.post("/prueba", async (_req: AuthRequest, res: Response) => {
  if (!correoActivo) {
    res.status(400).json({
      error:
        "El correo no está configurado. Completa SMTP_USER, SMTP_PASS y NOTIFY_EMAIL en el archivo .env",
    });
    return;
  }

  await enviarCorreo(
    "✅ Correo de prueba — FarmaVida",
    plantilla(
      "Prueba de configuración",
      `<p>¡Todo listo! 🎉</p>
       <p>Si estás leyendo esto, el sistema FarmaVida ya puede enviarte notificaciones por correo.</p>
       <p style="color:#6b7280;font-size:12px;">Recibirás avisos de: cada venta, stock bajo, productos por vencer y el resumen diario.</p>`
    )
  );

  res.json({ ok: true, mensaje: `Correo de prueba enviado a ${process.env.NOTIFY_EMAIL}` });
});

// POST /api/notificaciones/resumen — fuerza el envío del resumen diario
router.post("/resumen", async (_req: AuthRequest, res: Response) => {
  await notificarResumenDiario();
  res.json({ ok: true });
});

// POST /api/notificaciones/por-vencer — fuerza la revisión de vencimientos
router.post("/por-vencer", async (_req: AuthRequest, res: Response) => {
  await notificarPorVencer(30);
  res.json({ ok: true });
});

export default router;

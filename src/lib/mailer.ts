import nodemailer from "nodemailer";

const SMTP_USER = process.env.SMTP_USER?.trim();
const SMTP_PASS = process.env.SMTP_PASS?.trim().replace(/\s/g, ""); // Gmail muestra la clave con espacios
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL?.trim();

/** El correo solo está activo si las tres variables están configuradas. */
export const correoActivo = Boolean(SMTP_USER && SMTP_PASS && NOTIFY_EMAIL);

const transporter = correoActivo
  ? nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false, // STARTTLS
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    })
  : null;

/**
 * Envía un correo a la dueña. Nunca lanza: si falla, solo lo registra en consola,
 * para que un problema de correo jamás rompa una venta o una compra.
 */
export async function enviarCorreo(asunto: string, html: string): Promise<void> {
  if (!transporter || !NOTIFY_EMAIL) return;
  try {
    await transporter.sendMail({
      from: `"FarmaVida" <${SMTP_USER}>`,
      to: NOTIFY_EMAIL,
      subject: asunto,
      html,
    });
    console.log(`[CORREO] Enviado: ${asunto}`);
  } catch (e) {
    console.error(`[CORREO] Error al enviar "${asunto}":`, (e as Error).message);
  }
}

/** Verifica la conexión SMTP al arrancar (solo informativo). */
export async function verificarCorreo(): Promise<void> {
  if (!transporter) {
    console.log("📭 Correo NO configurado (SMTP_USER/SMTP_PASS/NOTIFY_EMAIL vacíos) — no se enviarán notificaciones.");
    return;
  }
  try {
    await transporter.verify();
    console.log(`📬 Correo listo: enviando desde ${SMTP_USER} → ${NOTIFY_EMAIL}`);
  } catch (e) {
    console.error("📭 Correo configurado pero la conexión falló:", (e as Error).message);
  }
}

// ─── Plantilla HTML común ────────────────────────────────────────────────────
export function plantilla(titulo: string, contenido: string): string {
  return `
  <div style="font-family:'Segoe UI',Arial,sans-serif;background:#f4f6f8;padding:24px;">
    <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
      <div style="background:#1e3a5f;padding:18px 24px;">
        <div style="font-size:20px;font-weight:800;color:#fff;">Farma<span style="color:#29abe2;">Vida</span></div>
        <div style="font-size:12px;color:rgba(255,255,255,.65);margin-top:2px;">${titulo}</div>
      </div>
      <div style="padding:24px;color:#1f2937;font-size:14px;line-height:1.6;">
        ${contenido}
      </div>
      <div style="padding:14px 24px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;text-align:center;">
        Mensaje automático del sistema FarmaVida
      </div>
    </div>
  </div>`;
}

/** Formatea un monto en quetzales. */
export const q = (n: number) =>
  `Q ${n.toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

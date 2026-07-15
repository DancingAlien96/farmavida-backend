import { prisma } from "./prisma";
import { enviarCorreo, plantilla, q, correoActivo } from "./mailer";

const fechaCorta = (d: Date) =>
  d.toLocaleDateString("es-GT", { day: "2-digit", month: "short", year: "numeric" });

// ─── 1) Aviso por cada venta registrada ──────────────────────────────────────
export async function notificarVenta(ventaId: number): Promise<void> {
  if (!correoActivo) return;

  const venta = await prisma.venta.findUnique({
    where: { id: ventaId },
    include: {
      cliente: true,
      farmaceutico: { select: { email: true } },
      detalles: { include: { producto: { select: { nombre: true } } } },
    },
  });
  if (!venta) return;

  const cliente = venta.cliente
    ? `${venta.cliente.nombres} ${venta.cliente.apellidos}`
    : "Consumidor final";

  const filas = venta.detalles
    .map(
      (d) => `<tr>
        <td style="padding:6px 0;border-bottom:1px solid #f3f4f6;">${d.producto.nombre}</td>
        <td style="padding:6px 0;border-bottom:1px solid #f3f4f6;text-align:center;">${d.cantidad}</td>
        <td style="padding:6px 0;border-bottom:1px solid #f3f4f6;text-align:right;">${q(Number(d.subtotal))}</td>
      </tr>`
    )
    .join("");

  const html = plantilla(
    "Nueva venta registrada",
    `<p>Se registró la venta <strong>#V-${venta.id}</strong>.</p>
     <table style="width:100%;border-collapse:collapse;font-size:13px;margin:12px 0;">
       <tr style="color:#9ca3af;font-size:11px;text-transform:uppercase;">
         <th style="text-align:left;padding-bottom:6px;">Producto</th>
         <th style="text-align:center;padding-bottom:6px;">Cant.</th>
         <th style="text-align:right;padding-bottom:6px;">Subtotal</th>
       </tr>
       ${filas}
     </table>
     <p style="font-size:18px;font-weight:800;color:#1e3a5f;text-align:right;margin:8px 0;">
       Total: ${q(Number(venta.total))}
     </p>
     <p style="color:#6b7280;font-size:12px;">
       Cliente: ${cliente}<br>
       Método de pago: ${venta.metodoPago}<br>
       Atendió: ${venta.farmaceutico.email}<br>
       Fecha: ${venta.fecha.toLocaleString("es-GT")}
     </p>`
  );

  await enviarCorreo(`Venta #V-${venta.id} — ${q(Number(venta.total))}`, html);
}

// ─── 2) Alerta de stock bajo ─────────────────────────────────────────────────
/**
 * Avisa solo de los productos indicados que quedaron en o por debajo del umbral.
 * Se llama después de una venta, con los productos que se vendieron.
 */
export async function notificarStockBajo(productoIds: number[]): Promise<void> {
  if (!correoActivo || productoIds.length === 0) return;

  const productos = await prisma.producto.findMany({
    where: { id: { in: productoIds }, activo: true },
  });
  const bajos = productos.filter((p) => p.stock <= p.stockMinimo);
  if (bajos.length === 0) return;

  const filas = bajos
    .map(
      (p) => `<tr>
        <td style="padding:6px 0;border-bottom:1px solid #f3f4f6;">${p.nombre}</td>
        <td style="padding:6px 0;border-bottom:1px solid #f3f4f6;text-align:center;font-weight:700;color:${p.stock === 0 ? "#dc2626" : "#d97706"};">
          ${p.stock}
        </td>
        <td style="padding:6px 0;border-bottom:1px solid #f3f4f6;text-align:center;color:#9ca3af;">${p.stockMinimo}</td>
      </tr>`
    )
    .join("");

  const html = plantilla(
    "Alerta de stock bajo",
    `<p>Los siguientes productos necesitan <strong>reabastecerse</strong>:</p>
     <table style="width:100%;border-collapse:collapse;font-size:13px;margin:12px 0;">
       <tr style="color:#9ca3af;font-size:11px;text-transform:uppercase;">
         <th style="text-align:left;padding-bottom:6px;">Producto</th>
         <th style="text-align:center;padding-bottom:6px;">Quedan</th>
         <th style="text-align:center;padding-bottom:6px;">Umbral</th>
       </tr>
       ${filas}
     </table>
     <p style="color:#6b7280;font-size:12px;">Registra una compra en el sistema para reponer el stock.</p>`
  );

  await enviarCorreo(
    `⚠️ Stock bajo: ${bajos.length} producto${bajos.length !== 1 ? "s" : ""}`,
    html
  );
}

// ─── 3) Productos próximos a vencer ──────────────────────────────────────────
export async function notificarPorVencer(dias = 30): Promise<void> {
  if (!correoActivo) return;

  const limite = new Date();
  limite.setDate(limite.getDate() + dias);

  const productos = await prisma.producto.findMany({
    where: {
      activo: true,
      stock: { gt: 0 },
      fechaVencimiento: { not: null, lte: limite },
    },
    orderBy: { fechaVencimiento: "asc" },
  });
  if (productos.length === 0) return;

  const hoy = new Date();
  const filas = productos
    .map((p) => {
      const venc = p.fechaVencimiento!;
      const restantes = Math.ceil((venc.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
      const vencido = restantes < 0;
      return `<tr>
        <td style="padding:6px 0;border-bottom:1px solid #f3f4f6;">${p.nombre}</td>
        <td style="padding:6px 0;border-bottom:1px solid #f3f4f6;text-align:center;">${p.stock}</td>
        <td style="padding:6px 0;border-bottom:1px solid #f3f4f6;text-align:right;color:${vencido ? "#dc2626" : "#d97706"};font-weight:600;">
          ${fechaCorta(venc)} ${vencido ? "(VENCIDO)" : `(${restantes} d)`}
        </td>
      </tr>`;
    })
    .join("");

  const html = plantilla(
    "Productos próximos a vencer",
    `<p>Estos productos vencen en los próximos <strong>${dias} días</strong> (o ya vencieron):</p>
     <table style="width:100%;border-collapse:collapse;font-size:13px;margin:12px 0;">
       <tr style="color:#9ca3af;font-size:11px;text-transform:uppercase;">
         <th style="text-align:left;padding-bottom:6px;">Producto</th>
         <th style="text-align:center;padding-bottom:6px;">Stock</th>
         <th style="text-align:right;padding-bottom:6px;">Vence</th>
       </tr>
       ${filas}
     </table>
     <p style="color:#6b7280;font-size:12px;">Revisa estos productos para retirarlos o darles salida a tiempo.</p>`
  );

  await enviarCorreo(`🗓️ ${productos.length} producto(s) por vencer`, html);
}

// ─── 4) Resumen diario de ventas ─────────────────────────────────────────────
export async function notificarResumenDiario(): Promise<void> {
  if (!correoActivo) return;

  const inicio = new Date();
  inicio.setHours(0, 0, 0, 0);
  const fin = new Date();
  fin.setHours(23, 59, 59, 999);

  const ventas = await prisma.venta.findMany({
    where: { fecha: { gte: inicio, lte: fin } },
    include: { detalles: { include: { producto: { select: { nombre: true } } } } },
  });

  const completadas = ventas.filter((v) => v.estado === "COMPLETADA");
  const anuladas = ventas.filter((v) => v.estado === "ANULADA");
  const total = completadas.reduce((acc, v) => acc + Number(v.total), 0);

  // Productos más vendidos del día
  const conteo = new Map<string, number>();
  for (const v of completadas) {
    for (const d of v.detalles) {
      conteo.set(d.producto.nombre, (conteo.get(d.producto.nombre) ?? 0) + d.cantidad);
    }
  }
  const top = [...conteo.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topHtml = top.length
    ? top
        .map(
          ([nombre, cant]) =>
            `<tr>
              <td style="padding:5px 0;border-bottom:1px solid #f3f4f6;">${nombre}</td>
              <td style="padding:5px 0;border-bottom:1px solid #f3f4f6;text-align:right;font-weight:600;">${cant} uds</td>
            </tr>`
        )
        .join("")
    : `<tr><td style="padding:8px 0;color:#9ca3af;">Sin ventas hoy</td></tr>`;

  const html = plantilla(
    `Resumen del ${inicio.toLocaleDateString("es-GT", { day: "numeric", month: "long", year: "numeric" })}`,
    `<div style="display:flex;gap:10px;margin-bottom:16px;">
       <div style="flex:1;border:1px solid #e5e7eb;border-radius:8px;padding:10px 12px;">
         <div style="font-size:10px;color:#9ca3af;text-transform:uppercase;font-weight:700;">Ventas</div>
         <div style="font-size:20px;font-weight:800;">${completadas.length}</div>
       </div>
       <div style="flex:1;border:1px solid #e5e7eb;border-radius:8px;padding:10px 12px;">
         <div style="font-size:10px;color:#9ca3af;text-transform:uppercase;font-weight:700;">Ingresos</div>
         <div style="font-size:20px;font-weight:800;color:#1e3a5f;">${q(total)}</div>
       </div>
     </div>
     <p style="font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;margin-bottom:4px;">Más vendidos hoy</p>
     <table style="width:100%;border-collapse:collapse;font-size:13px;">${topHtml}</table>
     ${anuladas.length > 0 ? `<p style="color:#dc2626;font-size:12px;margin-top:12px;">${anuladas.length} venta(s) anulada(s) hoy.</p>` : ""}`
  );

  await enviarCorreo(`📊 Resumen del día — ${q(total)} en ${completadas.length} venta(s)`, html);
}

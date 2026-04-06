import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import type { Visit } from "@/types";
import { logger, LogCategory } from "@/services/logger";

function buildVisitHtml(visit: Visit): string {
  const checkIn = new Date(visit.check_in_at).toLocaleString("pt-PT");
  const checkOut = visit.check_out_at
    ? new Date(visit.check_out_at).toLocaleString("pt-PT")
    : "—";

  const row = (label: string, value: string) =>
    `<div class="row"><span class="lbl">${label}</span><span class="val">${value}</span></div>`;

  return `<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="UTF-8"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, sans-serif; color: #1E293B; padding: 40px; }
  .header { display: flex; align-items: center; gap: 12px; margin-bottom: 32px; }
  .logo-box { width: 48px; height: 48px; background: #1D4ED8; border-radius: 10px;
              display: flex; align-items: center; justify-content: center; }
  .logo-text { color: #fff; font-size: 22px; font-weight: 800; }
  h1 { font-size: 22px; color: #1D4ED8; }
  .subtitle { color: #64748B; font-size: 13px; margin-top: 2px; }
  .card { border: 1px solid #E2E8F0; border-radius: 10px; overflow: hidden; margin-bottom: 24px; }
  .card-title { background: #F8FAFC; padding: 10px 16px; font-size: 11px; font-weight: 700;
                color: #64748B; text-transform: uppercase; letter-spacing: .5px; }
  .row { display: flex; justify-content: space-between; padding: 10px 16px;
         border-bottom: 1px solid #F1F5F9; }
  .row:last-child { border-bottom: none; }
  .lbl { color: #64748B; font-size: 13px; }
  .val { font-weight: 600; font-size: 14px; text-align: right; max-width: 60%; }
  .badge { display: inline-block; padding: 2px 10px; border-radius: 99px;
           background: #DBEAFE; color: #1E40AF; font-size: 12px; font-weight: 700; }
  .footer { margin-top: 40px; text-align: center; color: #94A3B8; font-size: 11px; }
</style>
</head>
<body>
  <div class="header">
    <div class="logo-box"><span class="logo-text">EG</span></div>
    <div>
      <h1>Comprovante de Visita</h1>
      <p class="subtitle">EliteCondoGuard · Gerado em ${new Date().toLocaleString("pt-PT")}</p>
    </div>
  </div>

  <div class="card">
    <div class="card-title">Visitante</div>
    ${row("Nome", visit.visitor_name)}
    ${visit.visitor_doc ? row("Documento", visit.visitor_doc) : ""}
    ${visit.visitor_phone ? row("Telefone", visit.visitor_phone) : ""}
    ${visit.vehicle_license_plate ? row("Matrícula", visit.vehicle_license_plate) : ""}
  </div>

  <div class="card">
    <div class="card-title">Visita</div>
    ${visit.visit_type ? row("Tipo", visit.visit_type) : ""}
    ${visit.restaurant_name ? row("Restaurante", visit.restaurant_name) : ""}
    ${visit.sport_name ? row("Desporto", visit.sport_name) : ""}
    ${visit.unit_block && visit.unit_number
      ? row("Unidade", `Bloco ${visit.unit_block} — ${visit.unit_number}`)
      : ""}
    ${visit.reason ? row("Motivo", visit.reason) : ""}
    ${row("Modo de aprovação", visit.approval_mode ?? "—")}
  </div>

  <div class="card">
    <div class="card-title">Registo</div>
    ${row("Entrada", checkIn)}
    ${row("Saída", checkOut)}
    ${row("Estado", `<span class="badge">${visit.status}</span>`)}
    ${visit.qr_token ? row("QR Token", visit.qr_token) : ""}
  </div>

  <p class="footer">Documento gerado automaticamente pelo sistema EliteCondoGuard.<br/>
  ID da visita: ${visit.id}</p>
</body>
</html>`;
}

export async function shareVisitReceipt(visit: Visit): Promise<void> {
  try {
    const html = buildVisitHtml(visit);
    const { uri } = await Print.printToFileAsync({ html, base64: false });
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(uri, { UTI: ".pdf", mimeType: "application/pdf" });
    }
  } catch (error) {
    logger.error(LogCategory.GENERAL, "pdfService: failed to generate/share receipt", error);
    throw error;
  }
}

export async function printVisitReceipt(visit: Visit): Promise<void> {
  try {
    const html = buildVisitHtml(visit);
    await Print.printAsync({ html });
  } catch (error) {
    logger.error(LogCategory.GENERAL, "pdfService: failed to print receipt", error);
    throw error;
  }
}

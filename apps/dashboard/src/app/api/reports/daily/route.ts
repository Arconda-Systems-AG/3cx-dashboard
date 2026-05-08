import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import nodemailer from "nodemailer";
import type { AppSettings, AiAnalysis } from "@3cx-dash/types";
import { DEFAULT_SETTINGS } from "@3cx-dash/types";
import { collectFullDayStats } from "@/lib/db-stats";

function getSettingsPath(): string {
  return process.env.SETTINGS_PATH ?? path.join(process.cwd(), "data", "settings.json");
}

function getAnalysisPath(): string {
  return process.env.SETTINGS_PATH
    ? path.join(path.dirname(process.env.SETTINGS_PATH), "ai-analysis.json")
    : path.join(process.cwd(), "data", "ai-analysis.json");
}

async function loadSettings(): Promise<AppSettings> {
  try {
    const content = await fs.readFile(getSettingsPath(), "utf-8");
    return { ...DEFAULT_SETTINGS, ...JSON.parse(content) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

async function loadAiAnalysis(): Promise<AiAnalysis | null> {
  try {
    const content = await fs.readFile(getAnalysisPath(), "utf-8");
    return JSON.parse(content) as AiAnalysis;
  } catch {
    return null;
  }
}

function fmt(d: Date, opts: Intl.DateTimeFormatOptions) {
  return d.toLocaleString("de-DE", { timeZone: "Europe/Berlin", ...opts });
}

function fmtWait(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}:${String(sec).padStart(2, "0")} min` : `${s}s`;
}

function buildHtml(
  stats: Awaited<ReturnType<typeof collectFullDayStats>>,
  ai: AiAnalysis | null,
  dateStr: string,
  generatedAt: string,
  customerName: string,
  isTest: boolean,
): string {
  if (isTest) {
    return `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:32px;background:#0a1628;font-family:Arial,sans-serif;color:#e2e8f0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;">
    <tr><td style="background:linear-gradient(135deg,#001524,#0f2d4e);padding:28px 32px;border-radius:12px;text-align:center;">
      <h1 style="margin:0 0 8px;font-size:22px;color:#f0f6fc;">✓ E-Mail-Konfiguration erfolgreich</h1>
      <p style="margin:0;color:#64b5f6;font-size:14px;">Der 3CX Tagesbericht wird an diese Adresse gesendet.</p>
      <p style="margin:16px 0 0;color:#94a3b8;font-size:12px;">Generiert: ${generatedAt} · Powered by Arconda.AI</p>
    </td></tr>
  </table>
</body></html>`;
  }

  const today = stats?.today;
  const answerRate = today && today.total_incoming > 0
    ? Math.round((today.answered / today.total_incoming) * 100) : 0;
  const slaRate = today && today.total_incoming > 0
    ? Math.round(((today.total_incoming - today.not_in_20s) / today.total_incoming) * 100) : 0;
  const abandonRate = today && today.total_incoming > 0
    ? Math.round((today.abandoned / today.total_incoming) * 100) : 0;

  // ── Status-Farben ──────────────────────────────────────────────────────────
  const statusCfg = {
    gut:      { bg: "#052e16", border: "#166534", text: "#4ade80", icon: "✓", label: "Gut" },
    warnung:  { bg: "#451a03", border: "#92400e", text: "#fbbf24", icon: "⚠", label: "Warnung" },
    kritisch: { bg: "#450a0a", border: "#991b1b", text: "#f87171", icon: "✕", label: "Kritisch" },
  };
  const sc = ai ? (statusCfg[ai.status as keyof typeof statusCfg] ?? statusCfg.warnung) : null;

  // ── KPI-Kacheln ────────────────────────────────────────────────────────────
  const kpis = today ? [
    { label: "Eingehend",       value: String(today.total_incoming), color: "#3b82f6", sub: "Anrufe heute" },
    { label: "Angenommen",      value: `${answerRate}%`,             color: answerRate >= 80 ? "#10b981" : answerRate >= 60 ? "#f59e0b" : "#ef4444", sub: `${today.answered} Anrufe` },
    { label: "SLA ≤ 20 Sek.",   value: `${slaRate}%`,               color: slaRate >= 80 ? "#10b981" : slaRate >= 60 ? "#f59e0b" : "#ef4444",   sub: `${today.not_in_20s} überschritten` },
    { label: "Abbrüche",        value: `${abandonRate}%`,            color: abandonRate <= 10 ? "#10b981" : abandonRate <= 25 ? "#f59e0b" : "#ef4444", sub: `${today.abandoned} Anrufe` },
  ] : [];

  const kpiCells = kpis.map((k) => `
    <td width="25%" style="padding:0 6px;">
      <div style="background:#0d1f35;border:1px solid #1e3a5f;border-radius:10px;padding:16px 12px;text-align:center;">
        <div style="font-size:26px;font-weight:700;color:${k.color};line-height:1;">${k.value}</div>
        <div style="font-size:11px;font-weight:600;color:#e2e8f0;margin-top:4px;text-transform:uppercase;letter-spacing:.05em;">${k.label}</div>
        <div style="font-size:11px;color:#64748b;margin-top:2px;">${k.sub}</div>
      </div>
    </td>`).join("");

  // ── Abwurf-Funnel (visuelle Balken) ────────────────────────────────────────
  const funnelHtml = (() => {
    if (!today) return "";
    const total = today.total_incoming || 1;
    const ab1 = today.abwurf1_reached;
    const ab2 = today.abwurf2_reached;
    const noFlow = total - ab1;
    const ab1Only = ab1 - ab2;
    const bars = [
      { label: "Erstqueue (direkt)", value: noFlow,  pct: Math.round((noFlow / total) * 100),  color: "#10b981" },
      { label: "Abwurf 1 erreicht", value: ab1Only, pct: Math.round((ab1Only / total) * 100), color: "#f59e0b" },
      { label: "Abwurf 2 erreicht", value: ab2,     pct: Math.round((ab2 / total) * 100),     color: "#ef4444" },
    ];
    return bars.map((b) => `
      <tr>
        <td style="padding:5px 0;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="font-size:12px;color:#94a3b8;padding-bottom:3px;">${b.label}</td>
              <td style="font-size:12px;font-weight:600;color:${b.color};text-align:right;padding-bottom:3px;">${b.value} <span style="color:#475569;font-weight:400;">(${b.pct}%)</span></td>
            </tr>
            <tr>
              <td colspan="2" style="background:#132640;border-radius:4px;height:8px;overflow:hidden;">
                <div style="width:${b.pct}%;background:${b.color};height:8px;border-radius:4px;"></div>
              </td>
            </tr>
          </table>
        </td>
      </tr>`).join("");
  })();

  // ── Stundenverteilung (Balken-Chart) ───────────────────────────────────────
  const hourlyHtml = (() => {
    if (!stats?.stundenverteilung) return "";
    const hours = Object.entries(stats.stundenverteilung).sort(([a], [b]) => a.localeCompare(b));
    if (hours.length === 0) return "";
    const maxVal = Math.max(...hours.map(([, v]) => v), 1);
    const bars = hours.map(([h, v]) => {
      const pct = Math.round((v / maxVal) * 100);
      return `<td style="text-align:center;padding:0 2px;vertical-align:bottom;">
        <div style="font-size:9px;color:#64748b;margin-bottom:2px;">${v}</div>
        <div style="background:#3b82f6;width:18px;height:${Math.max(4, Math.round(pct * 0.6))}px;border-radius:2px 2px 0 0;margin:0 auto;"></div>
        <div style="font-size:9px;color:#475569;margin-top:3px;">${h}</div>
      </td>`;
    }).join("");
    return `<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
      <tr style="vertical-align:bottom;">${bars}</tr>
    </table>`;
  })();

  // ── Queue-Tabelle ──────────────────────────────────────────────────────────
  const queueRows = (stats?.queues ?? []).map((q, i) => {
    const sla = q.anrufe > 0 ? Math.round(((q.anrufe - q.nicht_in_20s) / q.anrufe) * 100) : 100;
    const slaColor = sla >= 80 ? "#4ade80" : sla >= 60 ? "#fbbf24" : "#f87171";
    return `<tr style="background:${i % 2 === 0 ? "#0d1f35" : "#0a1a2e"};">
      <td style="padding:8px 12px;font-size:12px;color:#e2e8f0;border-bottom:1px solid #132640;">${q.name}</td>
      <td style="padding:8px 12px;font-size:12px;text-align:right;color:#94a3b8;border-bottom:1px solid #132640;">${q.anrufe}</td>
      <td style="padding:8px 12px;font-size:12px;text-align:right;color:#4ade80;border-bottom:1px solid #132640;">${q.angenommen}</td>
      <td style="padding:8px 12px;font-size:12px;text-align:right;color:${slaColor};border-bottom:1px solid #132640;font-weight:600;">${sla}%</td>
      <td style="padding:8px 12px;font-size:12px;text-align:right;color:#94a3b8;border-bottom:1px solid #132640;">${fmtWait(q.avg_wartezeit_s)}</td>
    </tr>`;
  }).join("") || `<tr><td colspan="5" style="padding:16px;text-align:center;color:#475569;font-size:12px;">Keine Queue-Daten</td></tr>`;

  // ── KI-Analyse-Block ───────────────────────────────────────────────────────
  const aiBlock = (() => {
    if (!ai || !sc) return "";
    const chips = (ai.erkenntnisse ?? []).slice(0, 3).map((e, i) => {
      const colors = [
        { bg: "#1e3a5f", border: "#3b82f6", text: "#93c5fd" },
        { bg: "#2d1b4e", border: "#7c3aed", text: "#c4b5fd" },
        { bg: "#0f3338", border: "#0e7490", text: "#67e8f9" },
      ];
      const c = colors[i % colors.length];
      return `<tr><td style="padding:4px 0;">
        <div style="background:${c.bg};border:1px solid ${c.border};border-radius:6px;padding:8px 12px;font-size:12px;color:${c.text};line-height:1.5;">${e}</div>
      </td></tr>`;
    }).join("");

    const recs = (ai.empfehlungen ?? []).slice(0, 2).map((r) =>
      `<tr><td style="padding:4px 0 4px 16px;font-size:12px;color:#94a3b8;line-height:1.5;border-left:2px solid #1e3a5f;">→ ${r}</td></tr>`
    ).join("");

    return `
    <tr><td style="background:#0d1f35;padding:24px 32px;border-top:1px solid #132640;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding-bottom:16px;">
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.08em;vertical-align:middle;">✦ KI-Analyse · Arconda.AI</td>
                <td style="padding-left:12px;vertical-align:middle;">
                  <span style="background:${sc.bg};border:1px solid ${sc.border};border-radius:20px;padding:3px 10px;font-size:11px;font-weight:600;color:${sc.text};">${sc.icon} ${sc.label}</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr><td style="font-size:13px;color:#cbd5e1;line-height:1.6;padding-bottom:16px;">${ai.zusammenfassung}</td></tr>
        ${chips ? `<tr><td><table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">${chips}</table></td></tr>` : ""}
        ${recs ? `<tr><td><div style="font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;">Empfehlungen</div>
          <table width="100%" cellpadding="0" cellspacing="4">${recs}</table></td></tr>` : ""}
      </table>
    </td></tr>`;
  })();

  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>3CX Tagesbericht ${dateStr}</title>
</head>
<body style="margin:0;padding:32px 16px;background:#060e1a;font-family:-apple-system,Arial,sans-serif;color:#e2e8f0;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;border-radius:14px;overflow:hidden;border:1px solid #132640;">

  <!-- HEADER -->
  <tr>
    <td style="background:linear-gradient(135deg,#001524 0%,#0c2340 60%,#0f3358 100%);padding:28px 32px 24px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td>
            <div style="font-size:10px;font-weight:600;letter-spacing:.15em;color:#3b82f6;text-transform:uppercase;margin-bottom:6px;">Tagesbericht · 3CX Dashboard</div>
            <div style="font-size:24px;font-weight:700;color:#f0f6fc;line-height:1.2;">${customerName}</div>
            <div style="font-size:14px;color:#64b5f6;margin-top:4px;">${dateStr}</div>
          </td>
          <td style="text-align:right;vertical-align:top;">
            <div style="display:inline-block;background:rgba(59,130,246,0.15);border:1px solid rgba(59,130,246,0.3);border-radius:8px;padding:8px 14px;">
              <div style="font-size:20px;font-weight:700;color:#3b82f6;">${today?.total_incoming ?? "–"}</div>
              <div style="font-size:10px;color:#64b5f6;text-transform:uppercase;letter-spacing:.05em;">Anrufe heute</div>
            </div>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- KPI-KACHELN -->
  ${kpis.length > 0 ? `<tr><td style="background:#091629;padding:20px 26px;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>${kpiCells}</tr></table>
  </td></tr>` : ""}

  <!-- ABWURF-FUNNEL -->
  ${funnelHtml ? `<tr><td style="background:#0d1f35;padding:20px 32px;border-top:1px solid #132640;">
    <div style="font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.08em;margin-bottom:12px;">Abwurf-Funnel</div>
    <table width="100%" cellpadding="0" cellspacing="0">${funnelHtml}</table>
  </td></tr>` : ""}

  <!-- STUNDENVERTEILUNG -->
  ${hourlyHtml ? `<tr><td style="background:#091629;padding:20px 32px;border-top:1px solid #132640;">
    <div style="font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.08em;margin-bottom:12px;">Anrufaufkommen nach Stunde</div>
    ${hourlyHtml}
  </td></tr>` : ""}

  <!-- QUEUE-TABELLE -->
  ${stats?.queues?.length ? `<tr><td style="background:#0d1f35;padding:20px 32px;border-top:1px solid #132640;">
    <div style="font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.08em;margin-bottom:12px;">Statistik pro Warteschlange</div>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <thead>
        <tr style="background:#132640;">
          <th style="padding:8px 12px;text-align:left;font-size:11px;color:#64b5f6;font-weight:600;">Queue</th>
          <th style="padding:8px 12px;text-align:right;font-size:11px;color:#64b5f6;font-weight:600;">Eingehend</th>
          <th style="padding:8px 12px;text-align:right;font-size:11px;color:#64b5f6;font-weight:600;">Angenommen</th>
          <th style="padding:8px 12px;text-align:right;font-size:11px;color:#64b5f6;font-weight:600;">SLA</th>
          <th style="padding:8px 12px;text-align:right;font-size:11px;color:#64b5f6;font-weight:600;">⌀ Wartezeit</th>
        </tr>
      </thead>
      <tbody>${queueRows}</tbody>
    </table>
  </td></tr>` : ""}

  <!-- KI-ANALYSE -->
  ${aiBlock}

  <!-- FOOTER -->
  <tr>
    <td style="background:#060e1a;padding:16px 32px;border-top:1px solid #132640;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="font-size:11px;color:#334155;">Generiert: ${generatedAt} Uhr</td>
          <td style="text-align:right;font-size:11px;color:#334155;">Powered by <span style="color:#3b82f6;">Arconda.AI</span></td>
        </tr>
      </table>
    </td>
  </tr>

</table>
</body>
</html>`;
}

function buildText(
  stats: Awaited<ReturnType<typeof collectFullDayStats>>,
  ai: AiAnalysis | null,
  dateStr: string,
  generatedAt: string,
  customerName: string,
  isTest: boolean,
): string {
  if (isTest) return `[3CX Test] E-Mail-Konfiguration erfolgreich — ${customerName}\nGeneriert: ${generatedAt}`;

  const today = stats?.today;
  const answerRate = today && today.total_incoming > 0
    ? Math.round((today.answered / today.total_incoming) * 100) : 0;

  let text = `3CX Tagesbericht — ${customerName} — ${dateStr}\n${"=".repeat(50)}\n\n`;
  if (today) {
    text += `Eingehend:        ${today.total_incoming}\n`;
    text += `Angenommen:       ${today.answered} (${answerRate}%)\n`;
    text += `Abgebrochen:      ${today.abandoned}\n`;
    text += `Nicht in 20 Sek.: ${today.not_in_20s}\n`;
    text += `Abwurf 1:         ${today.abwurf1_reached}\n`;
    text += `Abwurf 2:         ${today.abwurf2_reached}\n\n`;
  }
  if (ai) {
    text += `KI-ANALYSE (${ai.status.toUpperCase()})\n${"-".repeat(30)}\n${ai.zusammenfassung}\n\n`;
    (ai.erkenntnisse ?? []).forEach((e) => (text += `• ${e}\n`));
    if ((ai.empfehlungen ?? []).length) {
      text += "\nEmpfehlungen:\n";
      (ai.empfehlungen ?? []).forEach((r) => (text += `→ ${r}\n`));
    }
    text += "\n";
  }
  text += `Generiert: ${generatedAt} Uhr · Powered by Arconda.AI`;
  return text;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { test?: boolean };
  const isTest = body.test === true;

  const settings = await loadSettings();

  if (!settings.smtpHost || !settings.smtpFrom) {
    return NextResponse.json({ error: "SMTP nicht konfiguriert." }, { status: 400 });
  }

  const recipients = isTest
    ? (settings.smtpFrom ?? "")
    : (settings.reportRecipients ?? settings.smtpFrom ?? "");

  if (!recipients) {
    return NextResponse.json({ error: "Keine Empfänger konfiguriert." }, { status: 400 });
  }

  const now = new Date();
  const dateStr = fmt(now, { day: "2-digit", month: "2-digit", year: "numeric" });
  const generatedAt = `${fmt(now, { day: "2-digit", month: "2-digit", year: "numeric" })} ${fmt(now, { hour: "2-digit", minute: "2-digit" })}`;
  const activeSystem = settings.systems?.find((s) => s.id === settings.activeSystemId);
  const customerName = activeSystem?.customerName ?? settings.customerName ?? "Hansa Nord";

  const [stats, ai] = await Promise.all([
    isTest ? Promise.resolve(null) : collectFullDayStats().catch(() => null),
    isTest ? Promise.resolve(null) : loadAiAnalysis(),
  ]);

  const subject = isTest
    ? `[3CX Test] E-Mail-Konfiguration erfolgreich — ${customerName}`
    : `[3CX] Tagesbericht ${dateStr} — ${customerName}`;

  const html = buildHtml(stats, ai, dateStr, generatedAt, customerName, isTest);
  const text = buildText(stats, ai, dateStr, generatedAt, customerName, isTest);

  try {
    const transporter = nodemailer.createTransport({
      host: settings.smtpHost,
      port: settings.smtpPort ?? 587,
      secure: (settings.smtpPort ?? 587) === 465,
      auth: settings.smtpUser ? { user: settings.smtpUser, pass: settings.smtpPassword ?? "" } : undefined,
      tls: { rejectUnauthorized: false },
      connectionTimeout: 10_000,
    });

    await transporter.sendMail({ from: settings.smtpFrom, to: recipients, subject, html, text });
    return NextResponse.json({ ok: true, recipients, subject });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

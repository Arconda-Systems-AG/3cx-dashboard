import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import nodemailer from "nodemailer";
import type { AppSettings, AiAnalysis, ReportProfile } from "@3cx-dash/types";
import { DEFAULT_SETTINGS } from "@3cx-dash/types";
import { collectFullDayStats } from "@/lib/db-stats";
import { xapiFetch } from "@/lib/threecx-client";

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
<body style="margin:0;padding:32px;background:#f1f5f9;font-family:Arial,sans-serif;color:#1e293b;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;">
    <tr><td style="background:linear-gradient(135deg,#001524,#0f2d4e);padding:28px 32px;border-radius:12px;text-align:center;">
      <h1 style="margin:0 0 8px;font-size:22px;color:#f0f6fc;">✓ E-Mail-Konfiguration erfolgreich</h1>
      <p style="margin:0;color:#93c5fd;font-size:14px;">Der 3CX Tagesbericht wird an diese Adresse gesendet.</p>
      <p style="margin:16px 0 0;color:#64b5f6;font-size:12px;">Generiert: ${generatedAt} · Powered by Arconda.AI</p>
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

  // ── Status-Farben (helles Theme) ──────────────────────────────────────────
  const statusCfg = {
    gut:      { bg: "#f0fdf4", border: "#86efac", text: "#15803d", icon: "✓", label: "Gut" },
    warnung:  { bg: "#fffbeb", border: "#fcd34d", text: "#b45309", icon: "⚠", label: "Warnung" },
    kritisch: { bg: "#fef2f2", border: "#fca5a5", text: "#b91c1c", icon: "✕", label: "Kritisch" },
  };
  const sc = ai ? (statusCfg[ai.status as keyof typeof statusCfg] ?? statusCfg.warnung) : null;

  // ── KPI-Kacheln ────────────────────────────────────────────────────────────
  const kpis = today ? [
    { label: "Eingehend",     value: String(today.total_incoming), color: "#2563eb", sub: "Anrufe heute" },
    { label: "Angenommen",   value: `${answerRate}%`,  color: answerRate >= 80 ? "#16a34a" : answerRate >= 60 ? "#d97706" : "#dc2626", sub: `${today.answered} Anrufe` },
    { label: "SLA ≤ 20 Sek.", value: `${slaRate}%`,   color: slaRate >= 80 ? "#16a34a" : slaRate >= 60 ? "#d97706" : "#dc2626",   sub: `${today.not_in_20s} überschritten` },
    { label: "Abbrüche",     value: `${abandonRate}%`, color: abandonRate <= 10 ? "#16a34a" : abandonRate <= 25 ? "#d97706" : "#dc2626", sub: `${today.abandoned} Anrufe` },
    { label: "Verlorene Anrufer", value: String(today.lost_callers ?? 0), color: (today.lost_callers ?? 0) === 0 ? "#16a34a" : "#e11d48", sub: `${today.lost_retried_ok ?? 0} später doch erreicht` },
  ] : [];

  const kpiCells = kpis.map((k) => `
    <td width="20%" style="padding:0 5px;">
      <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;padding:14px 10px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.06);">
        <div style="font-size:24px;font-weight:700;color:${k.color};line-height:1;">${k.value}</div>
        <div style="font-size:10px;font-weight:600;color:#374151;margin-top:4px;text-transform:uppercase;letter-spacing:.05em;">${k.label}</div>
        <div style="font-size:10px;color:#9ca3af;margin-top:2px;">${k.sub}</div>
      </div>
    </td>`).join("");

  // ── Abwurf-Funnel ────────────────────────────────────────────────────────
  const funnelHtml = (() => {
    if (!today) return "";
    const total = today.total_incoming || 1;
    const ab1 = today.abwurf1_reached;
    const ab2 = today.abwurf2_reached;
    const noFlow = total - ab1;
    const ab1Only = ab1 - ab2;
    const bars = [
      { label: "Erstqueue (direkt)", value: noFlow,  pct: Math.round((noFlow / total) * 100),  color: "#16a34a", track: "#dcfce7" },
      { label: "Abwurf 1 erreicht", value: ab1Only, pct: Math.round((ab1Only / total) * 100), color: "#d97706", track: "#fef3c7" },
      { label: "Abwurf 2 erreicht", value: ab2,     pct: Math.round((ab2 / total) * 100),     color: "#dc2626", track: "#fee2e2" },
    ];
    return bars.map((b) => `
      <tr><td style="padding:5px 0;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="font-size:12px;color:#4b5563;padding-bottom:3px;">${b.label}</td>
            <td style="font-size:12px;font-weight:600;color:${b.color};text-align:right;padding-bottom:3px;">${b.value} <span style="color:#9ca3af;font-weight:400;">(${b.pct}%)</span></td>
          </tr>
          <tr>
            <td colspan="2" style="background:${b.track};border-radius:4px;height:8px;overflow:hidden;">
              <div style="width:${b.pct}%;background:${b.color};height:8px;border-radius:4px;"></div>
            </td>
          </tr>
        </table>
      </td></tr>`).join("");
  })();

  // ── Stundenverteilung ────────────────────────────────────────────────────
  const hourlyHtml = (() => {
    if (!stats?.stundenverteilung) return "";
    const hours = Object.entries(stats.stundenverteilung).sort(([a], [b]) => a.localeCompare(b));
    if (hours.length === 0) return "";
    const maxVal = Math.max(...hours.map(([, v]) => v), 1);
    const bars = hours.map(([h, v]) => {
      const pct = Math.round((v / maxVal) * 100);
      return `<td style="text-align:center;padding:0 2px;vertical-align:bottom;">
        <div style="font-size:9px;color:#6b7280;margin-bottom:2px;">${v}</div>
        <div style="background:#3b82f6;width:18px;height:${Math.max(4, Math.round(pct * 0.6))}px;border-radius:2px 2px 0 0;margin:0 auto;"></div>
        <div style="font-size:9px;color:#9ca3af;margin-top:3px;">${h}</div>
      </td>`;
    }).join("");
    return `<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;"><tr style="vertical-align:bottom;">${bars}</tr></table>`;
  })();

  // ── Queue-Tabelle ────────────────────────────────────────────────────────
  const queueRows = (stats?.queues ?? []).map((q, i) => {
    const sla = q.anrufe > 0 ? Math.round(((q.anrufe - q.nicht_in_20s) / q.anrufe) * 100) : 100;
    const slaColor = sla >= 80 ? "#16a34a" : sla >= 60 ? "#d97706" : "#dc2626";
    return `<tr style="background:${i % 2 === 0 ? "#ffffff" : "#f8fafc"};">
      <td style="padding:8px 12px;font-size:12px;color:#1e293b;border-bottom:1px solid #f1f5f9;">${q.name}</td>
      <td style="padding:8px 12px;font-size:12px;text-align:right;color:#374151;border-bottom:1px solid #f1f5f9;">${q.anrufe}</td>
      <td style="padding:8px 12px;font-size:12px;text-align:right;color:#16a34a;border-bottom:1px solid #f1f5f9;">${q.angenommen}</td>
      <td style="padding:8px 12px;font-size:12px;text-align:right;color:${slaColor};border-bottom:1px solid #f1f5f9;font-weight:600;">${sla}%</td>
      <td style="padding:8px 12px;font-size:12px;text-align:right;color:#374151;border-bottom:1px solid #f1f5f9;">${fmtWait(q.avg_wartezeit_s)}</td>
    </tr>`;
  }).join("") || `<tr><td colspan="5" style="padding:16px;text-align:center;color:#9ca3af;font-size:12px;">Keine Queue-Daten</td></tr>`;

  // ── KI-Analyse-Block ────────────────────────────────────────────────────
  const aiBlock = (() => {
    if (!ai || !sc) return "";
    const chips = (ai.erkenntnisse ?? []).slice(0, 3).map((e, i) => {
      const colors = [
        { bg: "#eff6ff", border: "#bfdbfe", text: "#1d4ed8" },
        { bg: "#f5f3ff", border: "#ddd6fe", text: "#6d28d9" },
        { bg: "#ecfeff", border: "#a5f3fc", text: "#0e7490" },
      ];
      const c = colors[i % colors.length];
      return `<tr><td style="padding:4px 0;">
        <div style="background:${c.bg};border:1px solid ${c.border};border-radius:6px;padding:8px 12px;font-size:12px;color:${c.text};line-height:1.5;">${e}</div>
      </td></tr>`;
    }).join("");

    const recs = (ai.empfehlungen ?? []).slice(0, 2).map((r) =>
      `<tr><td style="padding:4px 0 4px 16px;font-size:12px;color:#4b5563;line-height:1.5;border-left:2px solid #e2e8f0;">→ ${r}</td></tr>`
    ).join("");

    return `
    <tr><td style="background:#f8fafc;padding:24px 32px;border-top:1px solid #e2e8f0;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="padding-bottom:14px;">
          <table cellpadding="0" cellspacing="0"><tr>
            <td style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;vertical-align:middle;">✦ KI-Analyse · Arconda.AI</td>
            <td style="padding-left:12px;vertical-align:middle;">
              <span style="background:${sc.bg};border:1px solid ${sc.border};border-radius:20px;padding:3px 10px;font-size:11px;font-weight:600;color:${sc.text};">${sc.icon} ${sc.label}</span>
            </td>
          </tr></table>
        </td></tr>
        <tr><td style="font-size:13px;color:#374151;line-height:1.6;padding-bottom:14px;">${ai.zusammenfassung}</td></tr>
        ${chips ? `<tr><td><table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px;">${chips}</table></td></tr>` : ""}
        ${recs ? `<tr><td>
          <div style="font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;">Empfehlungen</div>
          <table width="100%" cellpadding="0" cellspacing="4">${recs}</table>
        </td></tr>` : ""}
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
<body style="margin:0;padding:32px 16px;background:#f1f5f9;font-family:-apple-system,Arial,sans-serif;color:#1e293b;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 4px 24px rgba(0,0,0,.08);">

  <!-- HEADER (bleibt dunkel) -->
  <tr>
    <td style="background:linear-gradient(135deg,#001524 0%,#0c2340 60%,#0f3358 100%);padding:28px 32px 24px;">
      <table width="100%" cellpadding="0" cellspacing="0"><tr>
        <td>
          <div style="font-size:10px;font-weight:600;letter-spacing:.15em;color:#60a5fa;text-transform:uppercase;margin-bottom:6px;">Tagesbericht · 3CX Dashboard</div>
          <div style="font-size:24px;font-weight:700;color:#f0f6fc;line-height:1.2;">${customerName}</div>
          <div style="font-size:14px;color:#93c5fd;margin-top:4px;">${dateStr}</div>
        </td>
        <td style="text-align:right;vertical-align:top;">
          <div style="display:inline-block;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:8px;padding:8px 14px;">
            <div style="font-size:20px;font-weight:700;color:#ffffff;">${today?.total_incoming ?? "–"}</div>
            <div style="font-size:10px;color:#93c5fd;text-transform:uppercase;letter-spacing:.05em;">Anrufe heute</div>
          </div>
        </td>
      </tr></table>
    </td>
  </tr>

  <!-- KPI-KACHELN -->
  ${kpis.length > 0 ? `<tr><td style="background:#ffffff;padding:20px 26px;border-bottom:1px solid #f1f5f9;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>${kpiCells}</tr></table>
  </td></tr>` : ""}

  <!-- ABWURF-FUNNEL -->
  ${funnelHtml ? `<tr><td style="background:#ffffff;padding:20px 32px;border-top:1px solid #f1f5f9;">
    <div style="font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:.08em;margin-bottom:12px;">Abwurf-Funnel</div>
    <table width="100%" cellpadding="0" cellspacing="0">${funnelHtml}</table>
  </td></tr>` : ""}

  <!-- STUNDENVERTEILUNG -->
  ${hourlyHtml ? `<tr><td style="background:#f8fafc;padding:20px 32px;border-top:1px solid #f1f5f9;">
    <div style="font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:.08em;margin-bottom:12px;">Anrufaufkommen nach Stunde</div>
    ${hourlyHtml}
  </td></tr>` : ""}

  <!-- QUEUE-TABELLE -->
  ${stats?.queues?.length ? `<tr><td style="background:#ffffff;padding:20px 32px;border-top:1px solid #f1f5f9;">
    <div style="font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:.08em;margin-bottom:12px;">Statistik pro Warteschlange</div>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #f1f5f9;border-radius:8px;overflow:hidden;">
      <thead><tr style="background:#f8fafc;">
        <th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;">Queue</th>
        <th style="padding:8px 12px;text-align:right;font-size:11px;color:#6b7280;font-weight:600;">Eingehend</th>
        <th style="padding:8px 12px;text-align:right;font-size:11px;color:#6b7280;font-weight:600;">Angenommen</th>
        <th style="padding:8px 12px;text-align:right;font-size:11px;color:#6b7280;font-weight:600;">SLA</th>
        <th style="padding:8px 12px;text-align:right;font-size:11px;color:#6b7280;font-weight:600;">⌀ Wartezeit</th>
      </tr></thead>
      <tbody>${queueRows}</tbody>
    </table>
  </td></tr>` : ""}

  <!-- KI-ANALYSE -->
  ${aiBlock}

  <!-- FOOTER -->
  <tr>
    <td style="background:#f8fafc;padding:14px 32px;border-top:1px solid #e2e8f0;">
      <table width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="font-size:11px;color:#9ca3af;">Generiert: ${generatedAt} Uhr</td>
        <td style="text-align:right;font-size:11px;color:#9ca3af;">Powered by <span style="color:#2563eb;font-weight:600;">Arconda.AI</span></td>
      </tr></table>
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

async function runScopedAiAnalysis(
  settings: AppSettings,
  stats: Awaited<ReturnType<typeof collectFullDayStats>>,
  departmentLabel: string,
): Promise<AiAnalysis | null> {
  if (!settings.aiUrl || !settings.aiModel || !stats) return null;

  const systemPrompt =
    "Du bist ein Call-Center-Analyse-Assistent für ein 3CX-Telefonanlage-Dashboard. " +
    "Analysiere die Tagesstatistiken der angegebenen Abteilung/Queue. " +
    "Bewerte SLA und Anrufaufkommen objektiv. " +
    "Antworte NUR mit validem JSON.";

  const userPrompt =
    `Abteilung/Filter: ${departmentLabel}\n` +
    `Tagesstatistiken:\n${JSON.stringify({
      gesamt: stats.today.total_incoming,
      angenommen: stats.today.answered,
      abgebrochen: stats.today.abandoned,
      nicht_in_20s: stats.today.not_in_20s,
      avg_wartezeit_s: stats.today.avg_wait_seconds,
      max_wartezeit_s: stats.today.max_wait_seconds,
      max_wartezeit_queue: stats.today.max_wait_queue,
      abwurf1: stats.today.abwurf1_reached,
      abwurf2: stats.today.abwurf2_reached,
      stundenverteilung: stats.stundenverteilung,
      queues: stats.queues,
    })}\n\n` +
    `JSON mit: status ("gut"|"warnung"|"kritisch"), ` +
    `zusammenfassung (1-2 Sätze), ` +
    `erkenntnisse (max. 3: Aufkommen/SLA/Besetzung), ` +
    `empfehlungen (max. 2 konkrete Maßnahmen), ` +
    `anomalien (auffällige Queue, Stunde, Muster — leer wenn unauffällig).`;

  try {
    const aiResponse = await fetch(`${settings.aiUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(settings.aiApiKey ? { Authorization: `Bearer ${settings.aiApiKey}` } : {}),
      },
      body: JSON.stringify({
        model: settings.aiModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: 600,
        chat_template_kwargs: { enable_thinking: false },
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!aiResponse.ok) return null;

    const aiData = await aiResponse.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const rawContent = aiData.choices?.[0]?.message?.content ?? "";

    const jsonMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/) ??
      rawContent.match(/(\{[\s\S]*\})/);
    const jsonStr = jsonMatch ? jsonMatch[1] : rawContent;
    const parsed = JSON.parse(jsonStr) as Partial<AiAnalysis>;

    return {
      timestamp: new Date().toISOString(),
      status: (parsed.status as AiAnalysis["status"]) ?? "warnung",
      zusammenfassung: parsed.zusammenfassung ?? "",
      erkenntnisse: Array.isArray(parsed.erkenntnisse) ? parsed.erkenntnisse : [],
      empfehlungen: Array.isArray(parsed.empfehlungen) ? parsed.empfehlungen : [],
      anomalien: Array.isArray(parsed.anomalien) ? parsed.anomalien : [],
    };
  } catch {
    return null;
  }
}

async function resolveQueueNumbersForDepartment(departmentId: number): Promise<string[]> {
  try {
    const groupData = await xapiFetch<{
      value: Array<{ Id: number; Members?: Array<{ Number?: string }> }>;
    }>(`Groups?$filter=Id eq ${departmentId}&$expand=Members($select=Number)`);

    const memberNums = new Set(
      (groupData.value[0]?.Members ?? [])
        .map((m) => m.Number)
        .filter((n): n is string => Boolean(n))
    );

    const queuesData = await xapiFetch<{
      value: Array<{ Number?: string; Agents?: Array<{ Number?: string }> }>;
    }>("Queues?$expand=Agents($select=Number)");

    return (queuesData.value ?? [])
      .filter((q) => (q.Agents ?? []).some((a) => a.Number && memberNums.has(a.Number)))
      .map((q) => q.Number)
      .filter((n): n is string => Boolean(n));
  } catch {
    return [];
  }
}

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const profileId = searchParams.get("profileId");

  const body = await request.json().catch(() => ({})) as { test?: boolean };
  const isTest = body.test === true;

  const settings = await loadSettings();

  if (!settings.smtpHost || !settings.smtpFrom) {
    return NextResponse.json({ error: "SMTP nicht konfiguriert." }, { status: 400 });
  }

  // ── Profil-Modus ──────────────────────────────────────────────────────────
  if (profileId) {
    const profile = (settings.reportProfiles ?? []).find((p: ReportProfile) => p.id === profileId);
    if (!profile) {
      return NextResponse.json({ error: `Profil ${profileId} nicht gefunden.` }, { status: 404 });
    }
    if (!profile.recipients) {
      return NextResponse.json({ error: "Profil hat keine Empfänger." }, { status: 400 });
    }

    // Queue-Filter für diese Abteilung auflösen
    let queueNumbers: string[] | undefined;
    if (profile.departmentId != null) {
      const resolved = await resolveQueueNumbersForDepartment(profile.departmentId);
      queueNumbers = resolved.length > 0 ? resolved : undefined;
    }

    const stats = await collectFullDayStats(queueNumbers).catch(() => null);
    const departmentLabel = profile.departmentName ?? profile.name;
    const ai = await runScopedAiAnalysis(settings, stats, departmentLabel);

    const now = new Date();
    const dateStr = fmt(now, { day: "2-digit", month: "2-digit", year: "numeric" });
    const generatedAt = `${fmt(now, { day: "2-digit", month: "2-digit", year: "numeric" })} ${fmt(now, { hour: "2-digit", minute: "2-digit" })}`;
    const activeSystem = settings.systems?.find((s) => s.id === settings.activeSystemId);
    const customerName = activeSystem?.customerName ?? settings.customerName ?? "Hansa Nord";

    const subject = `[3CX] Tagesbericht ${dateStr} — ${customerName} · ${profile.departmentName ?? profile.name}`;
    const html = buildHtml(stats, ai, dateStr, generatedAt, `${customerName} · ${departmentLabel}`, false);
    const text = buildText(stats, ai, dateStr, generatedAt, `${customerName} · ${departmentLabel}`, false);

    try {
      const transporter = nodemailer.createTransport({
        host: settings.smtpHost,
        port: settings.smtpPort ?? 587,
        secure: (settings.smtpPort ?? 587) === 465,
        auth: settings.smtpUser ? { user: settings.smtpUser, pass: settings.smtpPassword ?? "" } : undefined,
        tls: { rejectUnauthorized: false },
        connectionTimeout: 10_000,
      });

      await transporter.sendMail({ from: settings.smtpFrom, to: profile.recipients, subject, html, text });
      return NextResponse.json({ ok: true, recipients: profile.recipients, subject });
    } catch (error) {
      return NextResponse.json({ error: String(error) }, { status: 500 });
    }
  }

  // ── Standard-Modus (alle Queues) ─────────────────────────────────────────
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

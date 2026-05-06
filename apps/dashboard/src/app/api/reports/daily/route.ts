import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import nodemailer from "nodemailer";
import { createPool } from "@/lib/pg";
import type { AppSettings, TodayStats } from "@3cx-dash/types";
import { DEFAULT_SETTINGS } from "@3cx-dash/types";

function getSettingsPath(): string {
  return process.env.SETTINGS_PATH ?? path.join(process.cwd(), "data", "settings.json");
}

async function loadSettings(): Promise<AppSettings> {
  try {
    const content = await fs.readFile(getSettingsPath(), "utf-8");
    return { ...DEFAULT_SETTINGS, ...JSON.parse(content) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("de-DE", {
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString("de-DE", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function fetchTodayStats(): Promise<TodayStats | null> {
  const pool = await createPool();
  if (!pool) return null;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const client = await pool.connect();

  try {
    const sql = `
      WITH incoming_queue_calls AS (
        SELECT
          q.main_call_history_id,
          q.cdr_id,
          q.cdr_started_at,
          q.cdr_ended_at,
          q.termination_reason,
          q.continued_in_cdr_id,
          EXTRACT(EPOCH FROM (q.cdr_ended_at - q.cdr_started_at)) AS wait_seconds
        FROM public.cdroutput q
        WHERE q.destination_dn_type = 'queue'
          AND q.source_participant_is_incoming = true
          AND q.cdr_started_at >= $1
          AND q.cdr_started_at < $2
          AND q.source_entity_type != 'queue'
      ),
      direct_answered AS (
        SELECT DISTINCT iqc.main_call_history_id
        FROM incoming_queue_calls iqc
        JOIN public.cdroutput q2 ON q2.cdr_id = iqc.continued_in_cdr_id
          AND q2.destination_dn_type = 'extension'
      ),
      abwurf1 AS (
        SELECT DISTINCT iqc.main_call_history_id
        FROM incoming_queue_calls iqc
        JOIN public.cdroutput q2 ON q2.cdr_id = iqc.continued_in_cdr_id
          AND q2.destination_dn_type = 'queue'
      ),
      abwurf2 AS (
        SELECT DISTINCT iqc.main_call_history_id
        FROM incoming_queue_calls iqc
        JOIN public.cdroutput q2 ON q2.cdr_id = iqc.continued_in_cdr_id
          AND q2.destination_dn_type = 'queue'
        JOIN public.cdroutput q3 ON q3.cdr_id = q2.continued_in_cdr_id
          AND q3.destination_dn_type = 'queue'
      ),
      max_wait AS (
        SELECT destination_dn_name,
          EXTRACT(EPOCH FROM (cdr_ended_at - cdr_started_at)) AS secs
        FROM public.cdroutput
        WHERE destination_dn_type = 'queue'
          AND source_participant_is_incoming = true
          AND cdr_started_at >= $1
          AND cdr_started_at < $2
        ORDER BY secs DESC
        LIMIT 1
      )
      SELECT
        COUNT(*)::int                                                                      AS total_incoming,
        (SELECT COUNT(*)::int FROM direct_answered)                                        AS answered,
        COUNT(*) FILTER (WHERE termination_reason = 'src_participant_terminated')::int    AS abandoned,
        COUNT(*) FILTER (WHERE wait_seconds > 20)::int                                    AS not_in_20s,
        ROUND(AVG(wait_seconds)::numeric, 0)::int                                         AS avg_wait_seconds,
        (SELECT ROUND(secs::numeric, 0)::int FROM max_wait)                               AS max_wait_seconds,
        (SELECT destination_dn_name FROM max_wait)                                        AS max_wait_queue,
        (SELECT COUNT(*)::int FROM abwurf1)                                                AS abwurf1_reached,
        (SELECT COUNT(*)::int FROM abwurf2)                                                AS abwurf2_reached
      FROM incoming_queue_calls;
    `;

    const res = await client.query(sql, [today.toISOString(), now.toISOString()]);
    const row = res.rows[0] ?? {};
    return {
      total_incoming: Number(row.total_incoming ?? 0),
      answered: Number(row.answered ?? 0),
      abandoned: Number(row.abandoned ?? 0),
      not_in_20s: Number(row.not_in_20s ?? 0),
      avg_wait_seconds: Number(row.avg_wait_seconds ?? 0),
      max_wait_seconds: Number(row.max_wait_seconds ?? 0),
      max_wait_queue: String(row.max_wait_queue ?? ""),
      abwurf1_reached: Number(row.abwurf1_reached ?? 0),
      abwurf2_reached: Number(row.abwurf2_reached ?? 0),
    };
  } finally {
    client.release();
    await pool.end();
  }
}

function buildHtml(stats: TodayStats | null, dateStr: string, generatedAt: string, customerName: string): string {
  const answerRate = stats && stats.total_incoming > 0
    ? Math.round((stats.answered / stats.total_incoming) * 100)
    : null;

  const rows = stats ? `
    <tr><td style="padding:8px 12px;border-bottom:1px solid #1e3a5f;">Eingehend gesamt</td><td style="padding:8px 12px;border-bottom:1px solid #1e3a5f;text-align:right;font-weight:600;">${stats.total_incoming}</td></tr>
    <tr><td style="padding:8px 12px;border-bottom:1px solid #1e3a5f;">Angenommen</td><td style="padding:8px 12px;border-bottom:1px solid #1e3a5f;text-align:right;font-weight:600;color:#10b981;">${stats.answered}${answerRate !== null ? ` (${answerRate}%)` : ""}</td></tr>
    <tr><td style="padding:8px 12px;border-bottom:1px solid #1e3a5f;">Abgebrochen</td><td style="padding:8px 12px;border-bottom:1px solid #1e3a5f;text-align:right;font-weight:600;color:${stats.abandoned > 0 ? "#f97316" : "#94a3b8"};">${stats.abandoned}</td></tr>
    <tr><td style="padding:8px 12px;border-bottom:1px solid #1e3a5f;">Nicht in 20 Sek. angenommen</td><td style="padding:8px 12px;border-bottom:1px solid #1e3a5f;text-align:right;font-weight:600;color:${stats.not_in_20s > 0 ? "#ef4444" : "#10b981"};">${stats.not_in_20s}</td></tr>
    <tr><td style="padding:8px 12px;border-bottom:1px solid #1e3a5f;">Abwurf 1 erreicht</td><td style="padding:8px 12px;border-bottom:1px solid #1e3a5f;text-align:right;font-weight:600;color:${stats.abwurf1_reached > 0 ? "#fbbf24" : "#94a3b8"};">${stats.abwurf1_reached}</td></tr>
    <tr><td style="padding:8px 12px;">Abwurf 2 erreicht</td><td style="padding:8px 12px;text-align:right;font-weight:600;color:${stats.abwurf2_reached > 0 ? "#ef4444" : "#94a3b8"};">${stats.abwurf2_reached}</td></tr>
  ` : `<tr><td colspan="2" style="padding:16px 12px;text-align:center;color:#94a3b8;">Keine Datenbankverbindung — Statistiken nicht verfügbar</td></tr>`;

  return `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><title>3CX Tagesbericht ${dateStr}</title></head>
<body style="margin:0;padding:0;background:#0a1628;font-family:Arial,sans-serif;color:#e2e8f0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:32px auto;">
    <tr>
      <td style="background:linear-gradient(135deg,#001524,#0f2d4e);padding:28px 32px;border-radius:12px 12px 0 0;">
        <h1 style="margin:0;font-size:20px;font-weight:700;color:#f0f6fc;">3CX Tagesbericht</h1>
        <p style="margin:4px 0 0;font-size:14px;color:#64b5f6;">${customerName} — ${dateStr}</p>
      </td>
    </tr>
    <tr>
      <td style="background:#0d1f35;padding:24px 32px;">
        <h2 style="margin:0 0 16px;font-size:14px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;">Queue-Statistiken heute</h2>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #1e3a5f;border-radius:8px;overflow:hidden;">
          <thead>
            <tr style="background:#132640;">
              <th style="padding:10px 12px;text-align:left;font-size:12px;color:#64b5f6;font-weight:600;">Kennzahl</th>
              <th style="padding:10px 12px;text-align:right;font-size:12px;color:#64b5f6;font-weight:600;">Wert</th>
            </tr>
          </thead>
          <tbody style="font-size:14px;">
            ${rows}
          </tbody>
        </table>
      </td>
    </tr>
    <tr>
      <td style="background:#0a1628;padding:16px 32px;border-radius:0 0 12px 12px;border-top:1px solid #1e3a5f;">
        <p style="margin:0;font-size:11px;color:#475569;">Generiert am ${generatedAt} Uhr · 3CX Dashboard</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildText(stats: TodayStats | null, dateStr: string, generatedAt: string, customerName: string): string {
  const answerRate = stats && stats.total_incoming > 0
    ? Math.round((stats.answered / stats.total_incoming) * 100)
    : null;

  if (!stats) {
    return `3CX Tagesbericht — ${customerName} — ${dateStr}\n\nKeine Datenbankverbindung — Statistiken nicht verfügbar.\n\nGeneriert: ${generatedAt} Uhr`;
  }

  return `3CX Tagesbericht — ${customerName} — ${dateStr}

Queue-Statistiken heute:
- Eingehend gesamt:          ${stats.total_incoming}
- Angenommen:                ${stats.answered}${answerRate !== null ? ` (${answerRate}%)` : ""}
- Abgebrochen:               ${stats.abandoned}
- Nicht in 20 Sek.:          ${stats.not_in_20s}
- Abwurf 1 erreicht:         ${stats.abwurf1_reached}
- Abwurf 2 erreicht:         ${stats.abwurf2_reached}

Generiert: ${generatedAt} Uhr · 3CX Dashboard`;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { test?: boolean };
  const isTest = body.test === true;

  const settings = await loadSettings();

  if (!settings.smtpHost || !settings.smtpFrom) {
    return NextResponse.json({ error: "SMTP nicht konfiguriert. Bitte smtpHost und smtpFrom in den Einstellungen hinterlegen." }, { status: 400 });
  }

  const recipients = isTest
    ? (settings.smtpFrom ?? "")
    : (settings.reportRecipients ?? settings.smtpFrom ?? "");

  if (!recipients) {
    return NextResponse.json({ error: "Keine Empfänger konfiguriert." }, { status: 400 });
  }

  const now = new Date();
  const dateStr = formatDate(now);
  const generatedAt = `${formatDate(now)} ${formatTime(now)}`;
  const customerName = settings.customerName ?? "Hansa Nord";

  const stats = await fetchTodayStats().catch(() => null);

  const subject = isTest
    ? `[3CX Test] E-Mail-Konfiguration erfolgreich — ${customerName}`
    : `[3CX] Tagesbericht ${dateStr} — ${customerName}`;

  const html = buildHtml(isTest ? null : stats, dateStr, generatedAt, customerName);
  const text = buildText(isTest ? null : stats, dateStr, generatedAt, customerName);

  try {
    const transporter = nodemailer.createTransport({
      host: settings.smtpHost,
      port: settings.smtpPort ?? 587,
      secure: (settings.smtpPort ?? 587) === 465,
      auth: settings.smtpUser
        ? { user: settings.smtpUser, pass: settings.smtpPassword ?? "" }
        : undefined,
      tls: { rejectUnauthorized: false },
      connectionTimeout: 10_000,
    });

    await transporter.sendMail({
      from: settings.smtpFrom,
      to: recipients,
      subject,
      html,
      text,
    });

    return NextResponse.json({ ok: true, recipients, subject });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

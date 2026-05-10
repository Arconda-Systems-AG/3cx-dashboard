"use client";

import { useState, useEffect, useRef } from "react";
import { GlassCard, LedIndicator } from "@3cx-dash/ui";
import { useSettings, updateSettings, useSystems, useGroups } from "@/hooks/use-data";
import { useHealth } from "@/hooks/use-data";
import {
  Save, Plus, Trash2, CheckCircle, Wifi, Edit2, X, ChevronDown, ChevronUp, Database, Upload, ImageOff, Mail, Send, Brain, Clock, FileText,
} from "lucide-react";
import type { AppSettings, ThreeCXSystem, AuthMethod, AiSchedule, ReportSchedule, ReportProfile } from "@3cx-dash/types";

// ─── System Form ────────────────────────────────────────────
interface SystemFormData {
  name: string;
  url: string;
  authMethod: AuthMethod;
  clientId: string;
  clientSecret: string;
  webUser: string;
  webPassword: string;
  // DB config (pro Anlage)
  pgHost: string;
  pgPort: number;
  pgDatabase: string;
  pgUser: string;
  pgPassword: string;
  // Branding (pro Anlage)
  customerName: string;
  customerLogoUrl: string;
}

const EMPTY_FORM: SystemFormData = {
  name: "",
  url: "",
  authMethod: "client_credentials",
  clientId: "",
  clientSecret: "",
  webUser: "",
  webPassword: "",
  pgHost: "",
  pgPort: 5432,
  pgDatabase: "postgres",
  pgUser: "postgres",
  pgPassword: "",
  customerName: "",
  customerLogoUrl: "",
};

const PW_PLACEHOLDER = "••••••••";

function SystemForm({
  initial,
  systemId,
  onSave,
  onCancel,
}: {
  initial?: Partial<SystemFormData>;
  systemId?: string;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<SystemFormData>({ ...EMPTY_FORM, ...initial });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; latency?: number; error?: string } | null>(null);
  const [dbTestResult, setDbTestResult] = useState<{ ok: boolean; latency?: number; error?: string } | null>(null);
  const [testingDb, setTestingDb] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [showDb, setShowDb] = useState(!!(initial?.pgHost || initial?.customerName || initial?.customerLogoUrl));
  const logoFileRef = useRef<HTMLInputElement>(null);

  function set(key: keyof SystemFormData, val: string | number) {
    setForm((f) => ({ ...f, [key]: val }));
    if (key !== "pgHost" && key !== "pgPort" && key !== "pgDatabase" && key !== "pgUser" && key !== "pgPassword") {
      setTestResult(null);
    }
  }

  async function handleDbTest() {
    setTestingDb(true);
    setDbTestResult(null);
    try {
      const res = await fetch("/api/statistics/test-db", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host: form.pgHost,
          port: form.pgPort,
          database: form.pgDatabase,
          user: form.pgUser,
          password: form.pgPassword === PW_PLACEHOLDER ? undefined : form.pgPassword,
        }),
      });
      const data = await res.json();
      setDbTestResult(data);
    } catch (e) {
      setDbTestResult({ ok: false, error: String(e) });
    } finally {
      setTestingDb(false);
    }
  }

  function handleLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert("Logo zu groß (max. 2 MB)");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setForm((f) => ({ ...f, customerLogoUrl: reader.result as string }));
    };
    reader.readAsDataURL(file);
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const testId = systemId ?? "__new__";
      const res = await fetch(`/api/systems/${testId}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: form.url,
          authMethod: form.authMethod,
          clientId: form.clientId || undefined,
          clientSecret: form.clientSecret || undefined,
          webUser: form.webUser || undefined,
          webPassword: form.webPassword || undefined,
        }),
      });
      const data = await res.json();
      setTestResult(data);
    } catch (e) {
      setTestResult({ ok: false, error: String(e) });
    } finally {
      setTesting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const pgPassword = form.pgPassword === PW_PLACEHOLDER ? PW_PLACEHOLDER : (form.pgPassword || undefined);
      const payload = {
        name: form.name,
        url: form.url,
        authMethod: form.authMethod,
        ...(form.authMethod === "client_credentials"
          ? { clientId: form.clientId, clientSecret: form.clientSecret || undefined }
          : { webUser: form.webUser, webPassword: form.webPassword || undefined }),
        // DB config
        pgHost: form.pgHost || undefined,
        pgPort: form.pgHost ? (form.pgPort || 5432) : undefined,
        pgDatabase: form.pgHost ? (form.pgDatabase || "postgres") : undefined,
        pgUser: form.pgHost ? (form.pgUser || "postgres") : undefined,
        pgPassword,
        // Branding
        customerName: form.customerName || undefined,
        customerLogoUrl: form.customerLogoUrl || undefined,
      };

      if (systemId) {
        await fetch(`/api/systems/${systemId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        await fetch("/api/systems", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      setSaved(true);
      setTimeout(() => onSave(), 1000);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-secondary">Name *</label>
          <input
            required
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="z.B. Arconda HQ"
            className="w-full rounded-lg border border-glass bg-input px-3 py-2 text-sm text-body focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-secondary">3CX URL *</label>
          <input
            required
            type="url"
            value={form.url}
            onChange={(e) => set("url", e.target.value)}
            placeholder="https://firma.3cx.de"
            className="w-full rounded-lg border border-glass bg-input px-3 py-2 text-sm text-body focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-secondary">Authentifizierung</label>
          <div className="flex gap-2">
            {(["client_credentials", "web_auth"] as AuthMethod[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => set("authMethod", m)}
                className={`rounded-lg border px-4 py-2 text-sm font-medium transition-all ${
                  form.authMethod === m
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-glass text-secondary hover:text-heading"
                }`}
              >
                {m === "client_credentials" ? "OAuth2 / API Client" : "Nebenstelle + Passwort"}
              </button>
            ))}
          </div>
        </div>

        {form.authMethod === "client_credentials" ? (
          <>
            <div>
              <label className="mb-1 block text-xs font-medium text-secondary">Client-ID *</label>
              <input
                required
                value={form.clientId}
                onChange={(e) => set("clientId", e.target.value)}
                placeholder="apitest"
                className="w-full rounded-lg border border-glass bg-input px-3 py-2 text-sm text-body focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-secondary">
                Client-Secret {systemId ? "(leer = unverändert)" : "*"}
              </label>
              <input
                required={!systemId}
                type="password"
                value={form.clientSecret}
                onChange={(e) => set("clientSecret", e.target.value)}
                placeholder={systemId ? "••••••••" : "Secret eingeben"}
                autoComplete="new-password"
                className="w-full rounded-lg border border-glass bg-input px-3 py-2 text-sm text-body focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="mb-1 block text-xs font-medium text-secondary">Nebenstelle *</label>
              <input
                required
                value={form.webUser}
                onChange={(e) => set("webUser", e.target.value)}
                placeholder="87"
                className="w-full rounded-lg border border-glass bg-input px-3 py-2 text-sm text-body focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-secondary">
                Passwort {systemId ? "(leer = unverändert)" : "*"}
              </label>
              <input
                required={!systemId}
                type="password"
                value={form.webPassword}
                onChange={(e) => set("webPassword", e.target.value)}
                placeholder={systemId ? "••••••••" : "Passwort eingeben"}
                autoComplete="new-password"
                className="w-full rounded-lg border border-glass bg-input px-3 py-2 text-sm text-body focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </>
        )}
      </div>

      {/* Datenbank & Branding (aufklappbar) */}
      <div className="rounded-lg border border-glass">
        <button
          type="button"
          onClick={() => setShowDb((v) => !v)}
          className="flex w-full items-center justify-between px-3 py-2.5 text-xs font-medium text-secondary hover:text-heading"
        >
          <span className="flex items-center gap-2">
            <Database className="h-3.5 w-3.5" />
            Datenbank &amp; Branding
            {form.pgHost && <span className="ml-1 rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] text-primary">konfiguriert</span>}
          </span>
          {showDb ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>

        {showDb && (
          <div className="border-t border-glass p-3 space-y-4">
            {/* DB */}
            <div>
              <p className="mb-2 text-xs font-medium text-secondary">PostgreSQL (3CX CDR-Datenbank)</p>
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-[11px] text-muted">Host</label>
                  <input
                    value={form.pgHost}
                    onChange={(e) => set("pgHost", e.target.value)}
                    placeholder="10.1.70.56"
                    className="w-full rounded-lg border border-glass bg-input px-3 py-1.5 text-sm text-body focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-muted">Port</label>
                  <input
                    type="number"
                    value={form.pgPort}
                    onChange={(e) => set("pgPort", Number(e.target.value))}
                    className="w-full rounded-lg border border-glass bg-input px-3 py-1.5 text-sm text-body focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-muted">Datenbank</label>
                  <input
                    value={form.pgDatabase}
                    onChange={(e) => set("pgDatabase", e.target.value)}
                    placeholder="postgres"
                    className="w-full rounded-lg border border-glass bg-input px-3 py-1.5 text-sm text-body focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-muted">Benutzer</label>
                  <input
                    value={form.pgUser}
                    onChange={(e) => set("pgUser", e.target.value)}
                    placeholder="postgres"
                    className="w-full rounded-lg border border-glass bg-input px-3 py-1.5 text-sm text-body focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-muted">Passwort {systemId ? "(leer = unverändert)" : ""}</label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={form.pgPassword}
                    onFocus={(e) => { if (e.target.value === PW_PLACEHOLDER) set("pgPassword", ""); }}
                    onChange={(e) => set("pgPassword", e.target.value)}
                    placeholder={systemId ? PW_PLACEHOLDER : ""}
                    className="w-full rounded-lg border border-glass bg-input px-3 py-1.5 text-sm text-body focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              </div>
              {dbTestResult && (
                <div className={`mt-2 rounded-lg px-3 py-2 text-sm ${dbTestResult.ok ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
                  {dbTestResult.ok ? `DB-Verbindung erfolgreich (${dbTestResult.latency}ms)` : `DB-Fehler: ${dbTestResult.error}`}
                </div>
              )}
              <button
                type="button"
                onClick={handleDbTest}
                disabled={testingDb || !form.pgHost}
                className="mt-2 flex items-center gap-2 rounded-lg border border-glass px-3 py-1.5 text-xs text-secondary hover:text-heading disabled:opacity-50"
              >
                <Wifi className="h-3.5 w-3.5" />
                {testingDb ? "Teste DB..." : "DB-Verbindung testen"}
              </button>
            </div>

            {/* Branding */}
            <div>
              <p className="mb-2 text-xs font-medium text-secondary">Kunden-Branding</p>
              <div className="mb-2">
                <label className="mb-1 block text-[11px] text-muted">Kundenname (im Header)</label>
                <input
                  value={form.customerName}
                  onChange={(e) => set("customerName", e.target.value)}
                  placeholder="z.B. HansaNord"
                  className="w-full rounded-lg border border-glass bg-input px-3 py-1.5 text-sm text-body focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-muted">Kunden-Logo (PNG/SVG/WebP, max. 2 MB)</label>
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-24 items-center justify-center rounded-lg border border-glass bg-surface-subtle">
                    {form.customerLogoUrl ? (
                      <img src={form.customerLogoUrl} alt="Logo" className="h-10 max-w-[88px] object-contain" />
                    ) : (
                      <ImageOff className="h-5 w-5 text-muted" />
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <button
                      type="button"
                      onClick={() => logoFileRef.current?.click()}
                      className="flex items-center gap-1.5 rounded-lg border border-glass px-2.5 py-1.5 text-xs text-secondary hover:text-heading"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      {form.customerLogoUrl ? "Ersetzen" : "Hochladen"}
                    </button>
                    {form.customerLogoUrl && (
                      <button
                        type="button"
                        onClick={() => set("customerLogoUrl", "")}
                        className="flex items-center gap-1.5 rounded-lg border border-red-500/30 px-2.5 py-1.5 text-xs text-red-400 hover:bg-red-500/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Entfernen
                      </button>
                    )}
                  </div>
                </div>
                <input ref={logoFileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoFile} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Verbindungstest */}
      {testResult && (
        <div
          className={`rounded-lg px-3 py-2 text-sm ${
            testResult.ok
              ? "bg-emerald-500/10 text-emerald-400"
              : "bg-red-500/10 text-red-400"
          }`}
        >
          {testResult.ok
            ? `Verbindung erfolgreich (${testResult.latency}ms)`
            : `Fehler: ${testResult.error}`}
        </div>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
      {saved && <p className="text-sm text-emerald-400">Gespeichert ✓</p>}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={saving || saved}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-primary-hover"
        >
          <Save className="h-4 w-4" />
          {saving ? "Speichert..." : saved ? "Gespeichert ✓" : systemId ? "Speichern" : "Hinzufügen"}
        </button>
        <button
          type="button"
          onClick={handleTest}
          disabled={testing || !form.url}
          className="flex items-center gap-2 rounded-lg border border-glass px-3 py-2 text-sm text-secondary hover:text-heading disabled:opacity-50"
        >
          <Wifi className="h-4 w-4" />
          {testing ? "Teste..." : "Verbindung testen"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-2 rounded-lg border border-glass px-3 py-2 text-sm text-secondary hover:text-heading"
        >
          <X className="h-4 w-4" />
          Abbrechen
        </button>
      </div>
    </form>
  );
}



// ─── Email Report Section ─────────────────────────────────────
function EmailReportSection({ settings }: { settings: AppSettings | undefined }) {
  const [form, setForm] = useState({
    smtpHost: settings?.smtpHost ?? "",
    smtpPort: settings?.smtpPort ?? 587,
    smtpUser: settings?.smtpUser ?? "",
    smtpPassword: settings?.smtpPassword ?? "",
    smtpFrom: settings?.smtpFrom ?? "",
    reportRecipients: settings?.reportRecipients ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState<"test" | "daily" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (settings) {
      setForm({
        smtpHost: settings.smtpHost ?? "",
        smtpPort: settings.smtpPort ?? 587,
        smtpUser: settings.smtpUser ?? "",
        smtpPassword: settings.smtpPassword ?? "",
        smtpFrom: settings.smtpFrom ?? "",
        reportRecipients: settings.reportRecipients ?? "",
      });
    }
  }, [settings]);

  function set(key: keyof typeof form, val: string | number) {
    setForm((f) => ({ ...f, [key]: val }));
    setMessage(null);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const payload: Record<string, unknown> = { ...form };
      if (payload.smtpPassword === PW_PLACEHOLDER) delete payload.smtpPassword;
      await updateSettings(payload as Partial<AppSettings>);
      setMessage("SMTP-Einstellungen gespeichert");
    } catch (err) {
      setMessage(`Fehler: ${err}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleSend(type: "test" | "daily") {
    setSending(type);
    setMessage(null);
    try {
      const url = type === "test" ? "/api/reports/test" : "/api/reports/daily";
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Unbekannter Fehler");
      setMessage(type === "test" ? "Test-E-Mail gesendet ✓" : "Tagesbericht gesendet ✓");
    } catch (err) {
      setMessage(`Fehler: ${err}`);
    } finally {
      setSending(null);
    }
  }

  return (
    <GlassCard className="p-5">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-heading">
        <Mail className="h-4 w-4 text-primary" />
        E-Mail-Report (Tagesbericht)
      </h2>
      <form onSubmit={handleSave} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-secondary">SMTP Host</label>
            <input
              type="text" placeholder="mail.firma.de"
              value={form.smtpHost}
              onChange={(e) => set("smtpHost", e.target.value)}
              className="w-full rounded-lg border border-glass bg-input px-3 py-2 text-sm text-body focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-secondary">SMTP Port</label>
            <input
              type="number" min={1} max={65535}
              value={form.smtpPort}
              onChange={(e) => set("smtpPort", Number(e.target.value))}
              className="w-full rounded-lg border border-glass bg-input px-3 py-2 text-sm text-body focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-secondary">Benutzername (optional)</label>
            <input
              type="text" autoComplete="off"
              value={form.smtpUser}
              onChange={(e) => set("smtpUser", e.target.value)}
              className="w-full rounded-lg border border-glass bg-input px-3 py-2 text-sm text-body focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-secondary">Passwort</label>
            <input
              type="password" autoComplete="new-password"
              value={form.smtpPassword}
              onFocus={(e) => { if (e.target.value === PW_PLACEHOLDER) set("smtpPassword", ""); }}
              onChange={(e) => set("smtpPassword", e.target.value)}
              className="w-full rounded-lg border border-glass bg-input px-3 py-2 text-sm text-body focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-secondary">Absender-E-Mail</label>
            <input
              type="email" placeholder="dashboard@firma.de"
              value={form.smtpFrom}
              onChange={(e) => set("smtpFrom", e.target.value)}
              className="w-full rounded-lg border border-glass bg-input px-3 py-2 text-sm text-body focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-secondary">
              Empfänger (kommagetrennt)
            </label>
            <input
              type="text" placeholder="leiter@firma.de, chef@firma.de"
              value={form.reportRecipients}
              onChange={(e) => set("reportRecipients", e.target.value)}
              className="w-full rounded-lg border border-glass bg-input px-3 py-2 text-sm text-body focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>

        {message && (
          <p className={`text-sm ${message.startsWith("Fehler") ? "text-red-400" : "text-emerald-400"}`}>
            {message}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="submit" disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-primary-hover"
          >
            <Save className="h-4 w-4" />
            {saving ? "Speichert..." : "Speichern"}
          </button>
          <button
            type="button" disabled={sending !== null}
            onClick={() => handleSend("test")}
            className="flex items-center gap-2 rounded-lg border border-glass px-4 py-2 text-sm font-medium text-secondary hover:text-heading disabled:opacity-50"
          >
            <Mail className="h-4 w-4" />
            {sending === "test" ? "Sendet..." : "Test-E-Mail"}
          </button>
          <button
            type="button" disabled={sending !== null}
            onClick={() => handleSend("daily")}
            className="flex items-center gap-2 rounded-lg border border-glass px-4 py-2 text-sm font-medium text-secondary hover:text-heading disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            {sending === "daily" ? "Sendet..." : "Tagesbericht jetzt senden"}
          </button>
        </div>
      </form>
    </GlassCard>
  );
}

// ─── AI Settings Section ─────────────────────────────────────
function AiSettingsSection({ settings }: { settings: AppSettings | undefined }) {
  const [form, setForm] = useState({
    aiUrl: settings?.aiUrl ?? "",
    aiApiKey: settings?.aiApiKey ?? "",
    aiModel: settings?.aiModel ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (settings) {
      setForm({
        aiUrl: settings.aiUrl ?? "",
        aiApiKey: settings.aiApiKey ?? "",
        aiModel: settings.aiModel ?? "",
      });
    }
  }, [settings]);

  function set(key: keyof typeof form, val: string) {
    setForm((f) => ({ ...f, [key]: val }));
    setMessage(null);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const payload: Record<string, unknown> = { ...form };
      if (payload.aiApiKey === PW_PLACEHOLDER) delete payload.aiApiKey;
      await updateSettings(payload as Partial<AppSettings>);
      setMessage("KI-Einstellungen gespeichert");
    } catch (err) {
      setMessage(`Fehler: ${err}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <GlassCard className="p-5">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-heading">
        <Brain className="h-4 w-4 text-primary" />
        KI-Analyse (OpenAI-kompatible API)
      </h2>
      <form onSubmit={handleSave} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-secondary">API URL</label>
            <input
              type="text"
              placeholder="http://ki-server:8000/v1"
              value={form.aiUrl}
              onChange={(e) => set("aiUrl", e.target.value)}
              className="w-full rounded-lg border border-glass bg-input px-3 py-2 text-sm text-body focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-secondary">API-Key</label>
            <input
              type="password"
              autoComplete="new-password"
              placeholder="sk-..."
              value={form.aiApiKey}
              onFocus={(e) => { if (e.target.value === PW_PLACEHOLDER) set("aiApiKey", ""); }}
              onChange={(e) => set("aiApiKey", e.target.value)}
              className="w-full rounded-lg border border-glass bg-input px-3 py-2 text-sm text-body focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-secondary">Modell</label>
            <input
              type="text"
              placeholder="llama3"
              value={form.aiModel}
              onChange={(e) => set("aiModel", e.target.value)}
              className="w-full rounded-lg border border-glass bg-input px-3 py-2 text-sm text-body focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>

        {message && (
          <p className={`text-sm ${message.startsWith("Fehler") ? "text-red-400" : "text-emerald-400"}`}>
            {message}
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-primary-hover"
        >
          <Save className="h-4 w-4" />
          {saving ? "Speichert..." : "Speichern"}
        </button>
      </form>
    </GlassCard>
  );
}

// ─── Automatisierung ─────────────────────────────────────────
const DAYS = [
  { label: "Mo", val: 1 }, { label: "Di", val: 2 }, { label: "Mi", val: 3 },
  { label: "Do", val: 4 }, { label: "Fr", val: 5 }, { label: "Sa", val: 6 }, { label: "So", val: 0 },
];

function DayPicker({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  return (
    <div className="flex gap-1">
      {DAYS.map((d) => {
        const active = value.includes(d.val);
        return (
          <button
            key={d.val}
            type="button"
            onClick={() => onChange(active ? value.filter((v) => v !== d.val) : [...value, d.val])}
            className={`h-7 w-8 rounded text-xs font-semibold transition-colors ${active ? "bg-primary text-white" : "bg-surface-muted text-muted hover:text-heading"}`}
          >
            {d.label}
          </button>
        );
      })}
    </div>
  );
}

function AutomatisierungSection({ settings }: { settings: AppSettings | undefined }) {
  const defaultAi: AiSchedule = { enabled: false, days: [1,2,3,4,5], fromHour: 7, toHour: 18, intervalMinutes: 30 };
  const defaultRep: ReportSchedule = { enabled: false, days: [1,2,3,4,5], sendTime: "17:30" };

  const [ai, setAi] = useState<AiSchedule>(settings?.aiSchedule ?? defaultAi);
  const [rep, setRep] = useState<ReportSchedule>(settings?.reportSchedule ?? defaultRep);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (settings) {
      setAi(settings.aiSchedule ?? defaultAi);
      setRep(settings.reportSchedule ?? defaultRep);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await updateSettings({ aiSchedule: ai, reportSchedule: rep } as Partial<AppSettings>);
      setMessage("Zeitplan gespeichert");
    } catch (err) {
      setMessage(`Fehler: ${err}`);
    } finally {
      setSaving(false);
    }
  }

  const inputCls = "w-full rounded-lg border border-glass bg-input px-3 py-2 text-sm text-body focus:outline-none focus:ring-2 focus:ring-primary/30";

  return (
    <GlassCard className="p-5">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-heading">
        <Clock className="h-4 w-4 text-primary" />
        Automatisierung
      </h2>
      <form onSubmit={handleSave} className="space-y-6">

        {/* ── KI-Analyse ── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-secondary">KI-Analyse</p>
            <label className="flex cursor-pointer items-center gap-2">
              <span className="text-xs text-muted">{ai.enabled ? "Aktiv" : "Inaktiv"}</span>
              <div
                onClick={() => setAi((s) => ({ ...s, enabled: !s.enabled }))}
                className={`relative h-5 w-9 rounded-full transition-colors ${ai.enabled ? "bg-primary" : "bg-surface-muted"}`}
              >
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${ai.enabled ? "left-4" : "left-0.5"}`} />
              </div>
            </label>
          </div>
          {ai.enabled && (
            <div className="space-y-3 pl-0">
              <div>
                <p className="mb-1.5 text-xs text-muted">Wochentage</p>
                <DayPicker value={ai.days} onChange={(v) => setAi((s) => ({ ...s, days: v }))} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-muted">Von (Stunde)</label>
                  <input type="number" min={0} max={23} value={ai.fromHour}
                    onChange={(e) => setAi((s) => ({ ...s, fromHour: Number(e.target.value) }))}
                    className={inputCls} />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted">Bis (Stunde)</label>
                  <input type="number" min={0} max={23} value={ai.toHour}
                    onChange={(e) => setAi((s) => ({ ...s, toHour: Number(e.target.value) }))}
                    className={inputCls} />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted">Intervall (Min.)</label>
                  <select value={ai.intervalMinutes}
                    onChange={(e) => setAi((s) => ({ ...s, intervalMinutes: Number(e.target.value) }))}
                    className={inputCls}>
                    {[10, 15, 20, 30, 60, 120].map((v) => (
                      <option key={v} value={v}>{v} Min.</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-glass" />

        {/* ── E-Mail-Tagesbericht ── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-secondary">E-Mail-Tagesbericht</p>
            <label className="flex cursor-pointer items-center gap-2">
              <span className="text-xs text-muted">{rep.enabled ? "Aktiv" : "Inaktiv"}</span>
              <div
                onClick={() => setRep((s) => ({ ...s, enabled: !s.enabled }))}
                className={`relative h-5 w-9 rounded-full transition-colors ${rep.enabled ? "bg-primary" : "bg-surface-muted"}`}
              >
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${rep.enabled ? "left-4" : "left-0.5"}`} />
              </div>
            </label>
          </div>
          {rep.enabled && (
            <div className="space-y-3">
              <div>
                <p className="mb-1.5 text-xs text-muted">Wochentage</p>
                <DayPicker value={rep.days} onChange={(v) => setRep((s) => ({ ...s, days: v }))} />
              </div>
              <div className="w-40">
                <label className="mb-1 block text-xs text-muted">Uhrzeit (HH:MM)</label>
                <input type="time" value={rep.sendTime}
                  onChange={(e) => setRep((s) => ({ ...s, sendTime: e.target.value }))}
                  className={inputCls} />
              </div>
            </div>
          )}
        </div>

        {message && (
          <p className={`text-sm ${message.startsWith("Fehler") ? "text-red-400" : "text-emerald-400"}`}>
            {message}
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-primary-hover"
        >
          <Save className="h-4 w-4" />
          {saving ? "Speichert..." : "Speichern"}
        </button>
      </form>
    </GlassCard>
  );
}

// ─── Report Profiles Section ─────────────────────────────────
const EMPTY_PROFILE: Omit<ReportProfile, "id"> = {
  name: "",
  recipients: "",
  departmentId: undefined,
  departmentName: undefined,
  enabled: true,
  days: [1, 2, 3, 4, 5],
  sendTime: "17:30",
};

function ReportProfilesSection({ settings }: { settings: AppSettings | undefined }) {
  const { data: groupsData } = useGroups();
  const groups = groupsData?.groups ?? [];

  const profiles: ReportProfile[] = settings?.reportProfiles ?? [];

  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [formData, setFormData] = useState<Omit<ReportProfile, "id">>(EMPTY_PROFILE);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function openAdd() {
    setAdding(true);
    setEditingId(null);
    setFormData(EMPTY_PROFILE);
    setMessage(null);
  }

  function openEdit(profile: ReportProfile) {
    setEditingId(profile.id);
    setAdding(false);
    setFormData({
      name: profile.name,
      recipients: profile.recipients,
      departmentId: profile.departmentId,
      departmentName: profile.departmentName,
      enabled: profile.enabled,
      days: profile.days,
      sendTime: profile.sendTime,
    });
    setMessage(null);
  }

  function cancelForm() {
    setAdding(false);
    setEditingId(null);
    setMessage(null);
  }

  function setField<K extends keyof Omit<ReportProfile, "id">>(key: K, val: Omit<ReportProfile, "id">[K]) {
    setFormData((f) => ({ ...f, [key]: val }));
  }

  function handleDeptChange(val: string) {
    if (val === "") {
      setField("departmentId", undefined);
      setField("departmentName", undefined);
    } else {
      const id = Number(val);
      const grp = groups.find((g) => g.id === id);
      setField("departmentId", id);
      setField("departmentName", grp?.name);
    }
  }

  async function handleSaveProfile(e: React.FormEvent, sendAfter = false) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      let savedId: string;
      let updated: ReportProfile[];
      if (editingId) {
        savedId = editingId;
        updated = profiles.map((p) => p.id === editingId ? { ...formData, id: editingId } : p);
      } else {
        savedId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
        const newProfile: ReportProfile = { ...formData, id: savedId };
        updated = [...profiles, newProfile];
      }
      await updateSettings({ reportProfiles: updated });
      cancelForm();
      if (sendAfter) {
        setSending(savedId);
        try {
          const res = await fetch(`/api/reports/daily?profileId=${savedId}`, { method: "POST" });
          const data = await res.json() as { ok?: boolean; error?: string; recipients?: string };
          if (!res.ok) throw new Error(data.error ?? "Unbekannter Fehler");
          setMessage(`Testbericht gesendet an: ${data.recipients}`);
        } catch (err) {
          setMessage(`Fehler beim Senden: ${err}`);
        } finally {
          setSending(null);
        }
      } else {
        setMessage(editingId ? "Profil aktualisiert" : "Profil hinzugefügt");
      }
    } catch (err) {
      setMessage(`Fehler: ${err}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Profil löschen?")) return;
    try {
      const updated = profiles.filter((p) => p.id !== id);
      await updateSettings({ reportProfiles: updated });
    } catch (err) {
      setMessage(`Fehler: ${err}`);
    }
  }

  async function handleToggleEnabled(profile: ReportProfile) {
    try {
      const updated = profiles.map((p) =>
        p.id === profile.id ? { ...p, enabled: !p.enabled } : p
      );
      await updateSettings({ reportProfiles: updated });
    } catch (err) {
      setMessage(`Fehler: ${err}`);
    }
  }

  async function handleSendNow(profileId: string) {
    setSending(profileId);
    setMessage(null);
    try {
      const res = await fetch(`/api/reports/daily?profileId=${profileId}`, { method: "POST" });
      const data = await res.json() as { ok?: boolean; error?: string; recipients?: string };
      if (!res.ok) throw new Error(data.error ?? "Unbekannter Fehler");
      setMessage(`Bericht gesendet an: ${data.recipients}`);
    } catch (err) {
      setMessage(`Fehler: ${err}`);
    } finally {
      setSending(null);
    }
  }

  const inputCls = "w-full rounded-lg border border-glass bg-input px-3 py-2 text-sm text-body focus:outline-none focus:ring-2 focus:ring-primary/30";

  const DAY_LABELS: Record<number, string> = { 1: "Mo", 2: "Di", 3: "Mi", 4: "Do", 5: "Fr", 6: "Sa", 0: "So" };

  return (
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
          <FileText className="h-3.5 w-3.5 text-primary" />
          Berichtsprofile
        </h3>
        <button
          onClick={openAdd}
          className="flex items-center gap-1.5 rounded-lg border border-glass px-3 py-1.5 text-xs text-secondary hover:text-heading"
        >
          <Plus className="h-3.5 w-3.5" />
          Neues Profil
        </button>
      </div>

      {message && (
        <p className={`mb-3 text-xs ${message.startsWith("Fehler") ? "text-red-400" : "text-emerald-400"}`}>
          {message}
        </p>
      )}

      {/* Profile list */}
      <div className="space-y-2">
        {profiles.length === 0 && !adding && (
          <p className="text-xs text-muted">Noch keine Berichtsprofile konfiguriert.</p>
        )}

        {profiles.map((profile) => {
          const isEditing = editingId === profile.id;
          const daysLabel = profile.days
            .slice()
            .sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b))
            .map((d) => DAY_LABELS[d] ?? d)
            .join(", ");

          return (
            <div
              key={profile.id}
              className={`rounded-xl border transition-all ${profile.enabled ? "border-primary/30 bg-primary/5" : "border-glass bg-surface-subtle"}`}
            >
              <div className="flex items-start gap-3 p-3">
                <div className="flex-1 min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-heading">{profile.name}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${profile.enabled ? "bg-primary/20 text-primary" : "bg-surface-muted text-muted"}`}>
                      {profile.enabled ? "Aktiv" : "Inaktiv"}
                    </span>
                    {profile.departmentName && (
                      <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[10px] text-muted">
                        {profile.departmentName}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted truncate">{profile.recipients}</p>
                  <p className="text-xs text-muted">{daysLabel} · {profile.sendTime} Uhr</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleSendNow(profile.id)}
                    disabled={sending === profile.id}
                    title="Bericht jetzt senden"
                    className="flex items-center gap-1.5 rounded-lg border border-glass px-2 py-1.5 text-xs text-secondary hover:text-heading disabled:opacity-50"
                  >
                    <Send className="h-3.5 w-3.5" />
                    {sending === profile.id ? "..." : "Senden"}
                  </button>
                  <button
                    onClick={() => handleToggleEnabled(profile)}
                    title={profile.enabled ? "Deaktivieren" : "Aktivieren"}
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-glass text-secondary hover:text-heading"
                  >
                    <div className={`h-2.5 w-2.5 rounded-full ${profile.enabled ? "bg-emerald-400" : "bg-surface-muted"}`} />
                  </button>
                  <button
                    onClick={() => isEditing ? cancelForm() : openEdit(profile)}
                    title="Bearbeiten"
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-glass text-secondary hover:text-heading"
                  >
                    {isEditing ? <ChevronUp className="h-3.5 w-3.5" /> : <Edit2 className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    onClick={() => handleDelete(profile.id)}
                    title="Löschen"
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-glass text-secondary hover:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {isEditing && (
                <div className="border-t border-glass p-4">
                  <ProfileForm
                    formData={formData}
                    groups={groups}
                    saving={saving}
                    sending={sending === profile.id}
                    onSubmit={handleSaveProfile}
                    onCancel={cancelForm}
                    setField={setField}
                    handleDeptChange={handleDeptChange}
                    inputCls={inputCls}
                    isNew={false}
                  />
                </div>
              )}
            </div>
          );
        })}

        {adding && (
          <div className="rounded-xl border border-glass bg-surface-subtle p-4">
            <p className="mb-3 text-sm font-medium text-heading">Neues Berichtsprofil</p>
            <ProfileForm
              formData={formData}
              groups={groups}
              saving={saving}
              sending={sending !== null}
              onSubmit={handleSaveProfile}
              onCancel={cancelForm}
              setField={setField}
              handleDeptChange={handleDeptChange}
              inputCls={inputCls}
              isNew
            />
          </div>
        )}
      </div>
    </div>
  );
}

interface ProfileFormProps {
  formData: Omit<ReportProfile, "id">;
  groups: Array<{ id: number; name: string; memberNumbers: string[] }>;
  saving: boolean;
  sending: boolean;
  isNew: boolean;
  inputCls: string;
  onSubmit: (e: React.FormEvent, sendAfter?: boolean) => void;
  onCancel: () => void;
  setField: <K extends keyof Omit<ReportProfile, "id">>(key: K, val: Omit<ReportProfile, "id">[K]) => void;
  handleDeptChange: (val: string) => void;
}

function ProfileForm({ formData, groups, saving, sending, isNew, inputCls, onSubmit, onCancel, setField, handleDeptChange }: ProfileFormProps) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-secondary">Profilname *</label>
          <input
            required
            value={formData.name}
            onChange={(e) => setField("name", e.target.value)}
            placeholder="z.B. Serviceleiter Kiel"
            className={inputCls}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-secondary">Abteilung</label>
          <select
            value={formData.departmentId != null ? String(formData.departmentId) : ""}
            onChange={(e) => handleDeptChange(e.target.value)}
            className={inputCls}
          >
            <option value="">Alle Standorte</option>
            {groups.map((g) => (
              <option key={g.id} value={String(g.id)}>{g.name}</option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-secondary">Empfänger (kommagetrennt) *</label>
          <input
            required
            type="text"
            value={formData.recipients}
            onChange={(e) => setField("recipients", e.target.value)}
            placeholder="leiter@firma.de, chef@firma.de"
            className={inputCls}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-secondary">Uhrzeit (HH:MM)</label>
          <input
            type="time"
            value={formData.sendTime}
            onChange={(e) => setField("sendTime", e.target.value)}
            className={inputCls}
          />
        </div>
        <div className="flex flex-col justify-end">
          <label className="mb-1 block text-xs font-medium text-secondary">Aktiv</label>
          <div
            onClick={() => setField("enabled", !formData.enabled)}
            className={`relative h-5 w-9 cursor-pointer rounded-full transition-colors ${formData.enabled ? "bg-primary" : "bg-surface-muted"}`}
          >
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${formData.enabled ? "left-4" : "left-0.5"}`} />
          </div>
        </div>
      </div>
      <div>
        <p className="mb-1.5 text-xs font-medium text-secondary">Wochentage</p>
        <DayPicker value={formData.days} onChange={(v) => setField("days", v)} />
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="submit"
          disabled={saving || sending}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-primary-hover"
        >
          <Save className="h-4 w-4" />
          {saving ? "Speichert..." : isNew ? "Hinzufügen" : "Speichern"}
        </button>
        <button
          type="button"
          disabled={saving || sending}
          onClick={(e) => { e.preventDefault(); onSubmit(e as unknown as React.FormEvent, true); }}
          className="flex items-center gap-2 rounded-lg border border-primary/40 px-4 py-2 text-sm font-medium text-primary disabled:opacity-50 hover:bg-primary/10"
        >
          <Send className="h-4 w-4" />
          {sending ? "Sendet..." : "Speichern & Testbericht"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-2 rounded-lg border border-glass px-3 py-2 text-sm text-secondary hover:text-heading"
        >
          <X className="h-4 w-4" />
          Abbrechen
        </button>
      </div>
    </form>
  );
}

// ─── Main Page ───────────────────────────────────────────────
export default function SettingsPage() {
  const { data: settingsData, mutate: mutateSystems } = useSystems();
  const { data: settings } = useSettings();
  const { data: health } = useHealth();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<AppSettings>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const systems = settingsData?.systems ?? [];
  const activeSystemId = settingsData?.activeSystemId ?? "";

  async function activate(id: string) {
    await fetch(`/api/systems/${id}/activate`, { method: "POST" });
    mutateSystems();
  }

  async function deleteSystem(id: string) {
    if (!confirm("Telefonanlage löschen?")) return;
    await fetch(`/api/systems/${id}`, { method: "DELETE" });
    mutateSystems();
  }

  async function handleSaveAppSettings(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await updateSettings(form);
      setMessage("Gespeichert");
      setForm({});
    } catch (e) {
      setMessage(`Fehler: ${e}`);
    } finally {
      setSaving(false);
    }
  }

  const current = { ...settings, ...form };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-heading">Einstellungen</h1>
        <p className="text-sm text-muted">Telefonanlagen verwalten und App-Konfiguration</p>
      </div>

      {/* ── Telefonanlagen ── */}
      <GlassCard className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-heading">Telefonanlagen</h2>
          <button
            onClick={() => { setAdding(true); setEditingId(null); }}
            className="flex items-center gap-1.5 rounded-lg border border-glass px-3 py-1.5 text-xs text-secondary hover:text-heading"
          >
            <Plus className="h-3.5 w-3.5" />
            Hinzufügen
          </button>
        </div>

        {/* System-Liste */}
        <div className="space-y-2">
          {systems.length === 0 && !adding && (
            <div className="rounded-xl bg-surface-subtle p-6 text-center">
              <p className="text-sm text-muted">Noch keine Telefonanlage konfiguriert.</p>
              <button
                onClick={() => setAdding(true)}
                className="mt-3 flex items-center gap-2 mx-auto rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"
              >
                <Plus className="h-4 w-4" />
                Erste Anlage hinzufügen
              </button>
            </div>
          )}

          {systems.map((sys) => {
            const isActive = sys.id === activeSystemId;
            const isEditing = editingId === sys.id;

            return (
              <div
                key={sys.id}
                className={`rounded-xl border transition-all ${
                  isActive ? "border-primary/40 bg-primary/5" : "border-glass bg-surface-subtle"
                }`}
              >
                <div className="flex items-center gap-3 p-3">
                  {/* Status LED */}
                  <LedIndicator
                    status={isActive && health?.connected ? "online" : isActive ? "warning" : "offline"}
                    label=""
                  />

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-heading truncate">{sys.name}</span>
                      {isActive && (
                        <span className="rounded-full bg-primary/20 px-2 py-0.5 text-xs font-medium text-primary">
                          Aktiv
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted truncate">{sys.url}</p>
                    <p className="text-xs text-muted">
                      {sys.authMethod === "client_credentials"
                        ? `OAuth2 · ${(sys as any).clientId ?? "—"}`
                        : `Nebenstelle ${(sys as any).webUser ?? "—"}`}
                      {(sys as any).hasSecret && " · Passwort gespeichert"}
                    </p>
                  </div>

                  {/* Aktionen */}
                  <div className="flex items-center gap-1">
                    {!isActive && (
                      <button
                        onClick={() => activate(sys.id)}
                        title="Als aktiv setzen"
                        className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 px-2.5 py-1.5 text-xs text-emerald-400 hover:bg-emerald-500/10"
                      >
                        <CheckCircle className="h-3.5 w-3.5" />
                        Aktivieren
                      </button>
                    )}
                    <button
                      onClick={() => { setEditingId(isEditing ? null : sys.id); setAdding(false); }}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-glass text-secondary hover:text-heading"
                      title="Bearbeiten"
                    >
                      {isEditing ? <ChevronUp className="h-3.5 w-3.5" /> : <Edit2 className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      onClick={() => deleteSystem(sys.id)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-glass text-secondary hover:text-red-400"
                      title="Löschen"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Inline Edit */}
                {isEditing && (
                  <div className="border-t border-glass p-4">
                    <SystemForm
                      systemId={sys.id}
                      initial={{
                        name: sys.name,
                        url: sys.url,
                        authMethod: sys.authMethod,
                        clientId: (sys as any).clientId ?? "",
                        webUser: (sys as any).webUser ?? "",
                        // Fallback auf Top-Level-Settings für bestehende Konfigurationen
                        pgHost: (sys as any).pgHost ?? settings?.pgHost ?? "",
                        pgPort: (sys as any).pgPort ?? settings?.pgPort ?? 5432,
                        pgDatabase: (sys as any).pgDatabase ?? settings?.pgDatabase ?? "postgres",
                        pgUser: (sys as any).pgUser ?? settings?.pgUser ?? "postgres",
                        pgPassword: (sys as any).pgPassword ?? (settings?.pgPassword ? PW_PLACEHOLDER : ""),
                        customerName: (sys as any).customerName ?? settings?.customerName ?? "",
                        customerLogoUrl: (sys as any).customerLogoUrl ?? settings?.customerLogoUrl ?? "",
                      }}
                      onSave={() => { setEditingId(null); mutateSystems(); }}
                      onCancel={() => setEditingId(null)}
                    />
                  </div>
                )}

                {/* Berichtsprofile — nur für aktive Anlage */}
                {isActive && (
                  <div className="border-t border-glass">
                    <ReportProfilesSection settings={settings} />
                  </div>
                )}
              </div>
            );
          })}

          {/* Neue Anlage hinzufügen */}
          {adding && (
            <div className="rounded-xl border border-glass bg-surface-subtle p-4">
              <p className="mb-3 text-sm font-medium text-heading">Neue Telefonanlage</p>
              <SystemForm
                onSave={() => { setAdding(false); mutateSystems(); }}
                onCancel={() => setAdding(false)}
              />
            </div>
          )}
        </div>
      </GlassCard>

      {/* ── App-Einstellungen ── */}
      <GlassCard className="p-5">
        <h2 className="mb-4 text-sm font-semibold text-heading">App-Einstellungen</h2>
        <form onSubmit={handleSaveAppSettings} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-secondary">
                Polling Aktive Anrufe (ms)
              </label>
              <input
                type="number" min={1000} step={1000}
                value={current.pollIntervalActiveCalls ?? 5000}
                onChange={(e) => setForm({ ...form, pollIntervalActiveCalls: Number(e.target.value) })}
                className="w-full rounded-lg border border-glass bg-input px-3 py-2 text-sm text-body focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-secondary">
                Polling Nebenstellen (ms)
              </label>
              <input
                type="number" min={5000} step={1000}
                value={current.pollIntervalExtensions ?? 15000}
                onChange={(e) => setForm({ ...form, pollIntervalExtensions: Number(e.target.value) })}
                className="w-full rounded-lg border border-glass bg-input px-3 py-2 text-sm text-body focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-secondary">
                Max. Anrufprotokoll (Tage)
              </label>
              <input
                type="number" min={1} max={90}
                value={current.maxCallHistoryDays ?? 7}
                onChange={(e) => setForm({ ...form, maxCallHistoryDays: Number(e.target.value) })}
                className="w-full rounded-lg border border-glass bg-input px-3 py-2 text-sm text-body focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-secondary">
                Offline-Nebenstellen anzeigen
              </label>
              <select
                value={current.showOfflineExtensions ? "true" : "false"}
                onChange={(e) => setForm({ ...form, showOfflineExtensions: e.target.value === "true" })}
                className="w-full rounded-lg border border-glass bg-input px-3 py-2 text-sm text-body focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="true">Ja</option>
                <option value="false">Nein</option>
              </select>
            </div>
          </div>

          {message && (
            <p className={`text-sm ${message.startsWith("Fehler") ? "text-red-400" : "text-emerald-400"}`}>
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={saving || Object.keys(form).length === 0}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-primary-hover"
          >
            <Save className="h-4 w-4" />
            {saving ? "Speichert..." : "Speichern"}
          </button>
        </form>
      </GlassCard>

      {/* ── E-Mail-Report ── */}
      <EmailReportSection settings={settings} />

      {/* ── KI-Analyse ── */}
      <AiSettingsSection settings={settings} />

      {/* ── Automatisierung ── */}
      <AutomatisierungSection settings={settings} />
    </div>
  );
}

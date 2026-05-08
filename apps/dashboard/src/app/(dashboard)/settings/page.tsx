"use client";

import { useState, useEffect, useRef } from "react";
import { GlassCard, LedIndicator } from "@3cx-dash/ui";
import { useSettings, updateSettings, useSystems } from "@/hooks/use-data";
import { useHealth } from "@/hooks/use-data";
import {
  Save, Plus, Trash2, CheckCircle, Wifi, Edit2, X, ChevronDown, ChevronUp, Database, Upload, ImageOff, Mail, Send,
} from "lucide-react";
import type { AppSettings, ThreeCXSystem, AuthMethod } from "@3cx-dash/types";

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
  const [showDb, setShowDb] = useState(!!(initial?.pgHost));
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
      onSave();
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

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-primary-hover"
        >
          <Save className="h-4 w-4" />
          {saving ? "Speichert..." : systemId ? "Speichern" : "Hinzufügen"}
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
                        pgHost: (sys as any).pgHost ?? "",
                        pgPort: (sys as any).pgPort ?? 5432,
                        pgDatabase: (sys as any).pgDatabase ?? "postgres",
                        pgUser: (sys as any).pgUser ?? "postgres",
                        pgPassword: (sys as any).pgPassword ?? "",
                        customerName: (sys as any).customerName ?? "",
                        customerLogoUrl: (sys as any).customerLogoUrl ?? "",
                      }}
                      onSave={() => { setEditingId(null); mutateSystems(); }}
                      onCancel={() => setEditingId(null)}
                    />
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
    </div>
  );
}

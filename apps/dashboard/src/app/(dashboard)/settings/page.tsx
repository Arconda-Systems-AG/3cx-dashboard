"use client";

import { useState, useEffect, useRef } from "react";
import { GlassCard, LedIndicator } from "@3cx-dash/ui";
import { useSettings, updateSettings, useSystems } from "@/hooks/use-data";
import { useHealth } from "@/hooks/use-data";
import {
  Save, Plus, Trash2, CheckCircle, Wifi, Edit2, X, ChevronDown, ChevronUp, Database, Upload, ImageOff,
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
}

const EMPTY_FORM: SystemFormData = {
  name: "",
  url: "",
  authMethod: "client_credentials",
  clientId: "",
  clientSecret: "",
  webUser: "",
  webPassword: "",
};

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
  const [error, setError] = useState<string | null>(null);

  function set(key: keyof SystemFormData, val: string) {
    setForm((f) => ({ ...f, [key]: val }));
    setTestResult(null);
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
      const payload = {
        name: form.name,
        url: form.url,
        authMethod: form.authMethod,
        ...(form.authMethod === "client_credentials"
          ? { clientId: form.clientId, clientSecret: form.clientSecret || undefined }
          : { webUser: form.webUser, webPassword: form.webPassword || undefined }),
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

// ─── DB Config Section ───────────────────────────────────────
function DbConfigSection({ settings }: { settings: AppSettings | undefined }) {
  const [dbForm, setDbForm] = useState({
    pgHost: settings?.pgHost ?? "",
    pgPort: settings?.pgPort ?? 5432,
    pgDatabase: settings?.pgDatabase ?? "postgres",
    pgUser: settings?.pgUser ?? "postgres",
    pgPassword: settings?.pgPassword ?? "",
  });

  // Sync form state when settings loads asynchronously
  useEffect(() => {
    if (settings) {
      setDbForm({
        pgHost: settings.pgHost ?? "",
        pgPort: settings.pgPort ?? 5432,
        pgDatabase: settings.pgDatabase ?? "postgres",
        pgUser: settings.pgUser ?? "postgres",
        pgPassword: settings.pgPassword ?? "",
      });
    }
  }, [settings]);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; latency?: number; error?: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function set(key: keyof typeof dbForm, val: string | number) {
    setDbForm((f) => ({ ...f, [key]: val }));
    setTestResult(null);
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/statistics/test-db", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host: dbForm.pgHost,
          port: dbForm.pgPort,
          database: dbForm.pgDatabase,
          user: dbForm.pgUser,
          password: dbForm.pgPassword,
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

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await updateSettings(dbForm);
      setMessage("Gespeichert");
    } catch (e) {
      setMessage(`Fehler: ${e}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <GlassCard className="p-5">
      <div className="mb-4 flex items-center gap-2">
        <Database className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold text-heading">Datenbankquelle (PostgreSQL)</h2>
      </div>
      <p className="mb-4 text-xs text-muted">
        Verbindung zur 3CX PostgreSQL-Datenbank für Statistiken und Anrufauswertungen.
      </p>
      <form onSubmit={handleSave} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-secondary">Host</label>
            <input
              value={dbForm.pgHost}
              onChange={(e) => set("pgHost", e.target.value)}
              placeholder="10.1.70.56"
              className="w-full rounded-lg border border-glass bg-input px-3 py-2 text-sm text-body focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-secondary">Port</label>
            <input
              type="number"
              value={dbForm.pgPort}
              onChange={(e) => set("pgPort", Number(e.target.value))}
              placeholder="5432"
              className="w-full rounded-lg border border-glass bg-input px-3 py-2 text-sm text-body focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-secondary">Datenbankname</label>
            <input
              value={dbForm.pgDatabase}
              onChange={(e) => set("pgDatabase", e.target.value)}
              placeholder="postgres"
              className="w-full rounded-lg border border-glass bg-input px-3 py-2 text-sm text-body focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-secondary">Benutzername</label>
            <input
              value={dbForm.pgUser}
              onChange={(e) => set("pgUser", e.target.value)}
              placeholder="postgres"
              className="w-full rounded-lg border border-glass bg-input px-3 py-2 text-sm text-body focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-secondary">Passwort</label>
            <input
              type="password"
              value={dbForm.pgPassword}
              onChange={(e) => set("pgPassword", e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
              className="w-full rounded-lg border border-glass bg-input px-3 py-2 text-sm text-body focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>

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
        {message && (
          <p className={`text-sm ${message.startsWith("Fehler") ? "text-red-400" : "text-emerald-400"}`}>
            {message}
          </p>
        )}

        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-primary-hover"
          >
            <Save className="h-4 w-4" />
            {saving ? "Speichert..." : "Speichern"}
          </button>
          <button
            type="button"
            onClick={handleTest}
            disabled={testing || !dbForm.pgHost}
            className="flex items-center gap-2 rounded-lg border border-glass px-3 py-2 text-sm text-secondary hover:text-heading disabled:opacity-50"
          >
            <Wifi className="h-4 w-4" />
            {testing ? "Teste..." : "Verbindung testen"}
          </button>
        </div>
      </form>
    </GlassCard>
  );
}

// ─── Branding Section ────────────────────────────────────────
function BrandingSection({ settings, onUpdate }: { settings: AppSettings | undefined; onUpdate: () => void }) {
  const [customerName, setCustomerName] = useState(settings?.customerName ?? "");
  const [logoPreview, setLogoPreview] = useState<string | null>(settings?.customerLogoUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (settings) {
      setCustomerName(settings.customerName ?? "");
      setLogoPreview(settings.customerLogoUrl ?? null);
    }
  }, [settings]);

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setMessage(null);
    try {
      const fd = new FormData();
      fd.append("logo", file);
      const res = await fetch("/api/settings/logo", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setLogoPreview(data.logoUrl);
      setMessage("Logo gespeichert");
      onUpdate();
    } catch (err) {
      setMessage(`Fehler: ${err}`);
    } finally {
      setUploading(false);
    }
  }

  async function handleRemoveLogo() {
    setMessage(null);
    await fetch("/api/settings/logo", { method: "DELETE" });
    setLogoPreview(null);
    setMessage("Logo entfernt");
    onUpdate();
  }

  async function handleSaveName() {
    setSavingName(true);
    setMessage(null);
    try {
      await updateSettings({ customerName });
      setMessage("Name gespeichert");
      onUpdate();
    } catch (err) {
      setMessage(`Fehler: ${err}`);
    } finally {
      setSavingName(false);
    }
  }

  return (
    <GlassCard className="p-5">
      <h2 className="mb-4 text-sm font-semibold text-heading">Kunden-Branding</h2>
      <div className="space-y-4">
        {/* Kundenname */}
        <div>
          <label className="mb-1 block text-xs font-medium text-secondary">Kundenname (wird im Header angezeigt)</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="z.B. HansaNord"
              className="flex-1 rounded-lg border border-glass bg-input px-3 py-2 text-sm text-body focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <button
              onClick={handleSaveName}
              disabled={savingName}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-primary-hover"
            >
              <Save className="h-4 w-4" />
              {savingName ? "..." : "Speichern"}
            </button>
          </div>
        </div>

        {/* Logo */}
        <div>
          <label className="mb-2 block text-xs font-medium text-secondary">Kunden-Logo (PNG/SVG/WebP, max. 2 MB)</label>
          <div className="flex items-center gap-4">
            {/* Vorschau */}
            <div className="flex h-16 w-32 items-center justify-center rounded-lg border border-glass bg-surface-subtle">
              {logoPreview ? (
                <img src={logoPreview} alt="Logo Vorschau" className="h-12 max-w-[120px] object-contain" />
              ) : (
                <ImageOff className="h-6 w-6 text-muted" />
              )}
            </div>
            {/* Buttons */}
            <div className="flex flex-col gap-2">
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-2 rounded-lg border border-glass px-3 py-2 text-sm text-secondary hover:text-heading disabled:opacity-50"
              >
                <Upload className="h-4 w-4" />
                {uploading ? "Lädt hoch..." : logoPreview ? "Logo ersetzen" : "Logo hochladen"}
              </button>
              {logoPreview && (
                <button
                  onClick={handleRemoveLogo}
                  className="flex items-center gap-2 rounded-lg border border-red-500/30 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10"
                >
                  <Trash2 className="h-4 w-4" />
                  Logo entfernen
                </button>
              )}
            </div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
        </div>

        {message && (
          <p className={`text-sm ${message.startsWith("Fehler") ? "text-red-400" : "text-emerald-400"}`}>{message}</p>
        )}
      </div>
    </GlassCard>
  );
}

// ─── Main Page ───────────────────────────────────────────────
export default function SettingsPage() {
  const { data: settingsData, mutate: mutateSystems } = useSystems();
  const { data: settings, mutate: mutateSettings } = useSettings();
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

      {/* ── Datenbankquelle ── */}
      <DbConfigSection settings={settings} />

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

      {/* ── Kunden-Branding ── */}
      <BrandingSection settings={settings} onUpdate={() => mutateSettings()} />

      {/* ── Datenbank ── */}
      <DbConfigSection settings={settings} />
    </div>
  );
}

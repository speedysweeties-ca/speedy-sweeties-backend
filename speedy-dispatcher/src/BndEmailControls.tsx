import { useEffect, useRef, useState } from "react";
import { API_V1_BASE_URL } from "./apiConfig";
import { DispatchToggleControl } from "./DispatchToggleControl";

type Settings = { enabled: boolean; recipient: string; configured: boolean };

async function readSettings(response: Response): Promise<Settings> {
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.message === "string" ? data.message : "B&D email settings are unavailable.");
  if (typeof data.enabled !== "boolean" || typeof data.recipient !== "string" || typeof data.configured !== "boolean") {
    throw new Error("B&D email settings are unavailable.");
  }
  return data;
}

// Only mounted for an ADMIN, keyed by token to clear state when accounts change.
export function BndEmailControls({ token }: { token: string }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const requestVersion = useRef(0);
  const saveInFlight = useRef(false);
  const endpoint = `${API_V1_BASE_URL}/bnd-alerts/email-settings`;

  useEffect(() => {
    let active = true;
    const versionCounter = requestVersion;
    const controller = new AbortController();
    const refresh = async () => {
      if (saveInFlight.current) return;
      const version = ++versionCounter.current;
      try {
        const response = await fetch(endpoint, {
          headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)]),
        });
        const data = await readSettings(response);
        if (active && version === versionCounter.current) {
          setSettings(data); setError("");
        }
      } catch {
        if (active && version === versionCounter.current) {
          setSettings(null); setError("Could not load B&D email settings. Retrying automatically.");
        }
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    window.addEventListener("focus", refresh);
    return () => {
      active = false; ++versionCounter.current;
      controller.abort(); window.clearInterval(timer); window.removeEventListener("focus", refresh);
    };
  }, [endpoint, token]);

  const toggle = async () => {
    if (!settings || saveInFlight.current) return;
    saveInFlight.current = true;
    const version = ++requestVersion.current;
    setSaving(true); setError("");
    try {
      const response = await fetch(endpoint, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !settings.enabled }),
        signal: AbortSignal.timeout(15_000),
      });
      const data = await readSettings(response);
      if (version === requestVersion.current) setSettings(data);
    } catch (err) {
      if (version === requestVersion.current) {
        // A timeout may happen after the server saved it: do not show a guess.
        setSettings(null);
        setError(err instanceof Error ? err.message : "Could not save B&D email settings.");
      }
    } finally {
      saveInFlight.current = false;
      if (version === requestVersion.current) setSaving(false);
    }
  };

  return <DispatchToggleControl label="B&D Emails" switchLabel="B&D emails"
    enabled={settings?.enabled ?? null} saving={saving}
    loading={(!settings && !error) || Boolean(settings && !settings.configured && !settings.enabled)}
    onToggle={() => void toggle()}>
    <p>Send to {settings?.recipient ?? "rstubbings@hotmail.com"}.</p>
    <p className="mt-1">One email per waiting order. Works while Dispatcher is closed.</p>
    {settings && !settings.configured && <p role="status" className="mt-1 text-amber-200">Email setup needs attention.</p>}
    {error && <p role="alert" className="mt-1 text-amber-200">{error}</p>}
  </DispatchToggleControl>;
}

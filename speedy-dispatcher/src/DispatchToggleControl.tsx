import type { ReactNode } from "react";

type Props = {
  label: string;
  enabled: boolean | null;
  onToggle: () => void;
  loading?: boolean;
  saving?: boolean;
  switchLabel?: string;
  title?: string;
  children?: ReactNode;
};

export function DispatchToggleControl({
  label, enabled, onToggle, loading = false, saving = false,
  switchLabel = label, title, children,
}: Props) {
  const status = loading && enabled === null ? "Loading..."
    : enabled === true ? "ON" : enabled === false ? "OFF" : "Unknown";

  return (
    <div className="min-w-0">
      <div className="grid grid-cols-2 items-center gap-3">
        <span role="status" title={title}
          className={`inline-flex w-fit max-w-full items-center rounded-full border px-3 py-1 font-semibold ${
            enabled === true ? "bg-green-500/20 text-green-200 border-green-400/40"
              : enabled === false ? "bg-red-500/20 text-red-200 border-red-400/40"
              : "bg-zinc-800 text-zinc-300 border-zinc-700"
          }`}>
          {label}: {status}
        </span>
        <button type="button" role="switch" aria-label={switchLabel}
          aria-checked={enabled === true} onClick={onToggle}
          disabled={loading || saving || enabled === null}
          className={`min-h-14 w-full rounded-lg px-3 py-2 font-semibold transition disabled:opacity-50 lg:min-h-10 ${
            enabled === true ? "bg-red-600 hover:bg-red-700" : "bg-green-600 hover:bg-green-700"
          }`}>
          {saving ? "Saving..." : `Turn ${label} ${enabled === true ? "Off" : "On"}`}
        </button>
      </div>
      {children && <div className="mt-2 text-xs text-zinc-300">{children}</div>}
    </div>
  );
}

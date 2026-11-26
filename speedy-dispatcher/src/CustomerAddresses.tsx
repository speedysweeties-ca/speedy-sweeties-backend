import { useReleaseBlocker } from "./useReleaseBlocker";
import { useEffect, useState } from "react";
import { API_V1_BASE_URL } from "./apiConfig";
import { sameCustomerAddress } from "./customerAddressSelection";

export type SavedAddress = {
  id: string;
  label: string;
  addressLine1: string;
  unitNumber: string | null;
  buzzCode: string | null;
  city: string;
  province: string;
  isDefault: boolean;
};
type AddressFields = Pick<SavedAddress, "addressLine1" | "unitNumber" | "buzzCode" | "city" | "province">;
const blank = { addressLine1: "", unitNumber: "", buzzCode: "", city: "Guelph", province: "ON", isDefault: false };
type Form = typeof blank;
const fields = [
  ["addressLine1", "Street address", 250],
  ["unitNumber", "Apartment / Unit", 50], ["buzzCode", "Buzz Code", 50],
  ["city", "City", 100], ["province", "Province", 100],
] as const;

export function CustomerAddresses({ customerId, token, currentAddress, profileAddress, onSelect, disabled = false }: {
  customerId: string; token: string; currentAddress: AddressFields;
  profileAddress?: AddressFields;
  onSelect?: (address: AddressFields) => void; disabled?: boolean;
}) {
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<Form | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  useReleaseBlocker(form !== null || busy);
  const base = `${API_V1_BASE_URL}/customers/${customerId}/addresses`;
  useEffect(() => {
    const abort = new AbortController();
    fetch(base, { headers: { Authorization: `Bearer ${token}` }, signal: abort.signal })
      .then(async response => { if (!response.ok) throw new Error("Could not load saved addresses"); return response.json(); })
      .then(data => { if (!abort.signal.aborted) { setAddresses(data.addresses); setError(""); setLoading(false); } })
      .catch(() => { if (!abort.signal.aborted) { setError("Could not load saved addresses. Try again."); setLoading(false); } });
    return () => abort.abort();
  }, [base, token, reload]);

  async function mutate(method: string, id: string | null, body?: Form) {
    setBusy(true); setError("");
    try {
      const response = await fetch(`${base}${id ? `/${id}` : ""}`, {
        method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not save addresses");
      setAddresses(data.addresses); setForm(null); setEditingId(null);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save addresses"); }
    finally { setBusy(false); }
  }
  const locked = disabled || busy || loading;
  const unsavedProfile = profileAddress?.addressLine1.trim() && !addresses.some(a => sameCustomerAddress(profileAddress, a)) ? profileAddress : null;
  return <section aria-label="Saved addresses" className="space-y-2">
    <h3 className="font-semibold">Saved addresses</h3>
    {loading && <p>Loading addresses…</p>}
    {error && <p role="alert" className="text-red-300">{error} <button type="button" disabled={busy} onClick={() => { setLoading(true); setReload(n => n + 1); }}>Try again</button></p>}
    {onSelect && <label className="block mt-2">Use saved address
      <select disabled={locked} value="" className="block w-full bg-zinc-800 p-2" onChange={event => {
        const address = event.target.value === "profile" ? unsavedProfile : addresses.find(a => a.id === event.target.value);
        if (address) onSelect(address);
      }}>
        <option value="">Choose an address to copy into this order</option>
        {unsavedProfile && <option value="profile">Last-used profile address — {unsavedProfile.addressLine1}{unsavedProfile.unitNumber ? `, Unit ${unsavedProfile.unitNumber}` : ""}, {unsavedProfile.city}</option>}
        {addresses.map(a => <option key={a.id} value={a.id}>{a.label}{a.isDefault ? " (Default)" : ""} — {a.addressLine1}{a.unitNumber ? `, Unit ${a.unitNumber}` : ""}, {a.city}</option>)}
      </select>
    </label>}
    {!loading && !error && addresses.length === 0 && <p>No saved addresses yet.</p>}
    {addresses.map(a => <div key={a.id} className="mt-3 border-b border-zinc-700 pb-2">
      <p><strong>{a.label}</strong>{a.isDefault ? " · Default" : ""}</p>
      <p>{a.addressLine1}{a.unitNumber ? `, Unit ${a.unitNumber}` : ""}, {a.city}, {a.province}</p>
      {a.buzzCode && <p>Buzz Code: {a.buzzCode}</p>}
      <button type="button" disabled={locked} className="mr-3 underline" onClick={() => { setEditingId(a.id); setForm({ ...a, unitNumber: a.unitNumber || "", buzzCode: a.buzzCode || "" }); }}>Edit address</button>
      {!a.isDefault && <button type="button" disabled={locked} className="mr-3 underline" onClick={() => void mutate("PUT", a.id, { addressLine1: a.addressLine1, city: a.city, province: a.province, unitNumber: a.unitNumber || "", buzzCode: a.buzzCode || "", isDefault: true })}>Make default</button>}
      <button type="button" disabled={locked} className="underline" onClick={() => { if (window.confirm(`Remove saved address “${a.label}”? Existing orders will keep their address.`)) void mutate("DELETE", a.id); }}>Remove address</button>
    </div>)}
    <button type="button" disabled={locked} className="mt-3 underline" onClick={() => { setEditingId(null); setForm({ ...blank, ...currentAddress, unitNumber: currentAddress.unitNumber || "", buzzCode: currentAddress.buzzCode || "" }); }}>Add saved address</button>
    {form && <div className="mt-3 space-y-2">
      {fields.map(([key, label, max]) => <label key={key} className="block">{label}<input aria-label={label} maxLength={max} disabled={locked} className="block w-full bg-zinc-800 p-2" value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} /></label>)}
      <label className="block"><input type="checkbox" disabled={locked} checked={form.isDefault} onChange={e => setForm({ ...form, isDefault: e.target.checked })} /> Default address</label>
      <button type="button" disabled={locked || !form.addressLine1.trim() || !form.city.trim() || !form.province.trim()} className="mr-3 underline" onClick={() => {
        const { addressLine1, unitNumber, buzzCode, city, province, isDefault } = form;
        void mutate(editingId ? "PUT" : "POST", editingId, { addressLine1, unitNumber, buzzCode, city, province, isDefault });
      }}>Save address</button>
      <button type="button" disabled={busy} className="underline" onClick={() => setForm(null)}>Cancel address edit</button>
    </div>}
    <p className="mt-2 text-xs text-zinc-400">Creating an order saves its address and makes it the default for next time. Previous addresses remain available (up to 20). Confirm the delivery address with the customer.</p>
  </section>;
}

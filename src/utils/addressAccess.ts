type CivicAddress = { addressLine1?: string | null; city?: string | null; province?: string | null };

const normalized = (value: string | null | undefined): string =>
  (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
const provinceKey = (value: string | null | undefined): string => {
  const key = normalized(value);
  return key === "ontario" ? "on" : key;
};

// Deliberately keep embedded apartment numbers: a geocoding fingerprint may
// ignore them, but that is not safe when deciding whether to retain entry codes.
export const sameCivicAddress = (left: CivicAddress | null, right: CivicAddress): boolean =>
  left !== null && normalized(left.addressLine1) !== "" &&
  normalized(left.addressLine1) === normalized(right.addressLine1) &&
  normalized(left.city) === normalized(right.city) &&
  provinceKey(left.province) === provinceKey(right.province);

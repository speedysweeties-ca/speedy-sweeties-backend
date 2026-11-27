export type CustomerAddressFields = {
  addressLine1: string;
  unitNumber: string | null;
  buzzCode: string | null;
  city: string;
  province: string;
};

const normalized = (value: string | null) => (value || "").trim().toLowerCase().replace(/\s+/g, " ");
const provinceKey = (value: string) => normalized(value) === "ontario" ? "on" : normalized(value);
export function sameCustomerAddress(a: CustomerAddressFields, b: CustomerAddressFields): boolean {
  return (["addressLine1", "unitNumber", "buzzCode", "city"] as const)
    .every(key => normalized(a[key]) === normalized(b[key])) && provinceKey(a.province) === provinceKey(b.province);
}

// Orders placed before automatic address-book saving still have their address
// on the profile. Do not hide that address behind an older saved default.
export function initialCustomerAddress<T extends CustomerAddressFields>(customer: T & {
  savedAddresses?: (CustomerAddressFields & { isDefault: boolean })[];
}): CustomerAddressFields {
  const saved = customer.savedAddresses || [];
  if (customer.addressLine1.trim() && !saved.some(address => sameCustomerAddress(customer, address))) return customer;
  return saved.find(address => address.isDefault) || customer;
}

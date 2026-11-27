export type AddressFields = {
  addressLine1: string;
  unitNumber?: string | null;
  buzzCode?: string | null;
  city: string;
  province: string;
};

type ParsedGoogleAddressFields = Omit<
  AddressFields,
  "unitNumber" | "buzzCode"
> & {
  unitNumber: string;
};

export type GoogleAddressComponent = {
  long_name?: string;
  short_name?: string;
  types?: string[];
};

export type GoogleAutocompletePlace = {
  address_components?: GoogleAddressComponent[];
};

const getAddressComponent = (
  place: GoogleAutocompletePlace,
  componentTypes: string[]
) =>
  place.address_components?.find((component) =>
    component.types?.some((type) => componentTypes.includes(type))
  );

export const parseGoogleAutocompleteAddress = (
  place: GoogleAutocompletePlace
): ParsedGoogleAddressFields | null => {
  const streetNumber = getAddressComponent(place, ["street_number"]);
  const route = getAddressComponent(place, ["route"]);
  const subpremise = getAddressComponent(place, ["subpremise"]);
  const municipality = getAddressComponent(place, [
    "locality",
    "postal_town",
    "administrative_area_level_3",
  ]);
  const province = getAddressComponent(place, [
    "administrative_area_level_1",
  ]);

  const streetAddress = [streetNumber?.long_name, route?.long_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  const unit = subpremise?.long_name?.trim();
  const city = municipality?.long_name?.trim() || "";
  const provinceValue =
    province?.short_name?.trim() || province?.long_name?.trim() || "";

  if (!streetAddress || !city || !provinceValue) return null;

  return {
    addressLine1: streetAddress,
    unitNumber: unit || "",
    city,
    province: provinceValue,
  };
};

export const buildAddressRequestFields = (
  address: AddressFields
): AddressFields => {
  const hasUnitNumber = Object.prototype.hasOwnProperty.call(
    address,
    "unitNumber"
  );
  const hasBuzzCode = Object.prototype.hasOwnProperty.call(address, "buzzCode");

  return {
    addressLine1: address.addressLine1.trim(),
    ...(hasUnitNumber
      ? { unitNumber: address.unitNumber?.trim() || null }
      : {}),
    ...(hasBuzzCode ? { buzzCode: address.buzzCode?.trim() || null } : {}),
    city: address.city.trim(),
    province: address.province.trim(),
  };
};

// Apply civic edits synchronously so delayed form effects cannot erase newly
// entered access details. A complete saved-address patch supplies its own codes.
export const updateAddressFields = <T extends AddressFields>(current: T, patch: Partial<T>): T => {
  const next = { ...current, ...patch };
  const key = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
  const provinceKey = (value: string) => key(value) === "ontario" ? "on" : key(value);
  const changed = key(current.addressLine1) !== key(next.addressLine1) ||
    key(current.city) !== key(next.city) || provinceKey(current.province) !== provinceKey(next.province);
  return {
    ...current,
    ...(changed && "unitNumber" in current ? { unitNumber: "" } : {}),
    ...(changed && "buzzCode" in current ? { buzzCode: "" } : {}),
    ...patch,
  };
};

export const applyAutocompleteAddress = <T extends AddressFields>(current: T, selected: ParsedGoogleAddressFields): T => {
  const { unitNumber, ...civic } = selected;
  return updateAddressFields(current, { ...civic, ...(unitNumber ? { unitNumber } : {}) } as Partial<T>);
};

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

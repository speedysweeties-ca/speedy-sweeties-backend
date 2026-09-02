export type AddressFields = {
  addressLine1: string;
  city: string;
  province: string;
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
): AddressFields | null => {
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
  const addressLine1 = unit ? `${streetAddress} Unit ${unit}` : streetAddress;
  const city = municipality?.long_name?.trim() || "";
  const provinceValue =
    province?.short_name?.trim() || province?.long_name?.trim() || "";

  if (!addressLine1 || !city || !provinceValue) return null;

  return {
    addressLine1,
    city,
    province: provinceValue,
  };
};

export const buildAddressRequestFields = (
  address: AddressFields
): AddressFields => ({
  addressLine1: address.addressLine1.trim(),
  city: address.city.trim(),
  province: address.province.trim(),
});

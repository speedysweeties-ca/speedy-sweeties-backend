import { env } from "../config/env";
import { civicAddressMatches, DeliveryAddressInput, DeliveryAddressValidationError } from "./deliveryGeocoding.service";

export class AddressValidationUnavailableError extends Error {}

type AddressValidationOptions = { apiKey?: string; fetchImplementation?: typeof fetch };
type ValidatedComponent = {
  componentName?: { text?: string };
  componentType?: string;
  confirmationLevel?: string;
  inferred?: boolean;
  replaced?: boolean;
};

export const assertValidatedCivicAddress = (result: any, address: DeliveryAddressInput): void => {
  const verdict = result?.verdict;
  const components: ValidatedComponent[] = result?.address?.addressComponents;
  if (!verdict || !Array.isArray(components)) throw new AddressValidationUnavailableError();
  const find = (type: string) => components.find(component => component.componentType === type);
  const number = find("street_number"), route = find("route");
  const postal = result?.address?.postalAddress;
  const civicConfirmed = [number, route].every(component => component &&
    component.confirmationLevel === "CONFIRMED" && !component.inferred && !component.replaced);
  const matching = civicAddressMatches({ address_components: components.map(component => ({
    long_name: component.componentName?.text, types: [component.componentType || ""]
  })) }, address);
  if (!verdict.addressComplete || !["PREMISE", "SUB_PREMISE"].includes(verdict.validationGranularity) ||
      !civicConfirmed || !matching || postal?.regionCode !== "CA" ||
      !/^(ON|Ontario)$/i.test(postal?.administrativeArea || "") ||
      (postal?.locality || "").trim().toLowerCase() !== address.city.trim().toLowerCase() ||
      result.address.unresolvedTokens?.length) {
    throw new DeliveryAddressValidationError(
      "We couldn't confirm that house number and street. Please correct your address or call 519-826-8097."
    );
  }
};

export const validateCivicAddress = async (address: DeliveryAddressInput,
  options: AddressValidationOptions = {}): Promise<void> => {
  const apiKey = options.apiKey ?? env.GOOGLE_ADDRESS_VALIDATION_API_KEY;
  if (!apiKey) throw new AddressValidationUnavailableError();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await (options.fetchImplementation ?? fetch)(
      "https://addressvalidation.googleapis.com/v1:validateAddress", {
        method: "POST", signal: controller.signal,
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey },
        body: JSON.stringify({ address: { regionCode: "CA", administrativeArea: "ON",
          locality: address.city, addressLines: [address.addressLine1] } })
      });
    if (!response.ok) {
      const failure = await response.json().catch(() => ({})) as any;
      const knownReasons = new Set(["SERVICE_DISABLED", "API_KEY_SERVICE_BLOCKED", "BILLING_DISABLED", "API_KEY_INVALID"]);
      const reason = failure?.error?.details?.find((detail: any) => knownReasons.has(detail?.reason))?.reason;
      // Only status and an allowlisted configuration reason are logged.
      console.warn(`[Address Validation] Provider returned HTTP ${response.status}${reason ? ` (${reason})` : ""}.`);
      throw new AddressValidationUnavailableError();
    }
    const data = await response.json() as any;
    assertValidatedCivicAddress(data.result, address);
  } catch (error) {
    if (error instanceof DeliveryAddressValidationError) throw error;
    throw new AddressValidationUnavailableError();
  } finally { clearTimeout(timer); }
};

import { ApiError } from "./ApiError";

// Availability rule for the customer iOS channel, not an authorization credential
// or a review-only flag. Keep the matcher in sync with IOSProductPolicy.swift.
export const IOS_CUSTOMER_HEADER = "x-speedy-client";
export const IOS_CUSTOMER_CLIENT = "ios-customer";
export const IOS_PRODUCT_UNAVAILABLE_MESSAGE =
  "Tobacco, nicotine and vaping products cannot be ordered in this app. Remove them to continue.";

export class IOSProductUnavailableError extends ApiError {
  constructor() {
    super(400, IOS_PRODUCT_UNAVAILABLE_MESSAGE);
    Object.setPrototypeOf(this, IOSProductUnavailableError.prototype);
  }
}

const restricted = /\b(?:tobacco|tabacco|tabac|nicotine|nicotin|cigarettes?|cigars?|cigarillos?|cigs?|smokes|vapes?|vaping|vapers?|vaporizers?|vaporisers?|e\s*cig(?:arette)?s?|electronic\s*cigarettes?|e\s*liquids?|e\s*juice|hookahs?|shisha|snus|snuff|chewing\s*tobacco|rolling\s*papers?|cigarette\s*papers?|canadian\s*classics|next\s*(?:blue|red|silver|gold)|du\s*maurier|dumaurier|belmont|benson\s*(?:and\s*)?hedges|rothmans|peter\s*jackson|pall\s*mall|export\s*a|players|player\s*s|john\s*player|jps|mark\s*ten|marlboro|winston|lucky\s*strike|dunhill|vuse|juul|stlth|elf\s*bar|lost\s*mary|geek\s*bar|zonnic|zyn|pack\s*of\s*darts)\b/;

export const containsIOSRestrictedProduct = (value: unknown): boolean => {
  if (typeof value !== "string") return false;
  const normalized = value.normalize("NFKD").replace(/\p{M}/gu, "")
    .toLowerCase().replace(/\p{Cf}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ");
  return restricted.test(normalized);
};

export const assertIOSProductText = (values: unknown[]): void => {
  if (values.some(containsIOSRestrictedProduct)) throw new IOSProductUnavailableError();
};

export const isIOSCustomerRequest = (source: unknown, client: unknown): boolean =>
  source === "IOS_APP" || client === IOS_CUSTOMER_CLIENT;

export interface IOSCatalogProduct {
  name: string;
  brand?: string | null;
  size?: string | null;
  category?: string | null;
  pickupType?: string | null;
}

export const isIOSCatalogProductAllowed = (item: IOSCatalogProduct): boolean =>
  ![item.name, item.brand, item.size, item.category, item.pickupType]
    .some(containsIOSRestrictedProduct);

export const assertIOSCatalogProduct = (item: IOSCatalogProduct): void => {
  if (!isIOSCatalogProductAllowed(item)) throw new IOSProductUnavailableError();
};

// Also recognize a catalogue name followed by a package size, e.g. a neutral
// flavour name + 20 mg. A missing keyword in the customer's text is not evidence
// that a known tobacco/vaping catalogue product is permitted.
export const assertIOSCatalogRequests = (values: unknown[], catalog: IOSCatalogProduct[]): void => {
  const normalize = (value: string) => value.normalize("NFKD").replace(/\p{M}/gu, "")
    .toLowerCase().replace(/\p{Cf}/gu, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const requests = values.filter((value): value is string => typeof value === "string")
    .map(value => " " + normalize(value) + " ");
  for (const item of catalog) {
    if (isIOSCatalogProductAllowed(item)) continue;
    const name = normalize(item.name);
    if (name && requests.some(request => request.includes(" " + name + " "))) {
      throw new IOSProductUnavailableError();
    }
  }
};

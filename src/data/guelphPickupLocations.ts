import type { PickupTypeValue } from "../constants/pickupTypes";

export type SeedPickupLocation = {
  name: string;
  pickupType: Exclude<PickupTypeValue, "UNKNOWN">;
  addressLine1: string;
  city: "Guelph";
  province: "ON";
  postalCode: string;
  verificationSource: string;
};

export const GUELPH_CORE_PICKUP_LOCATIONS: readonly SeedPickupLocation[] = [
  {
    name: "LCBO - Wellington & Gordon",
    pickupType: "LCBO",
    addressLine1: "16 Wellington Street West",
    city: "Guelph",
    province: "ON",
    postalCode: "N1H 3R9",
    verificationSource: "LCBO official store directory"
  },
  {
    name: "LCBO - Speedvale & Stevenson",
    pickupType: "LCBO",
    addressLine1: "378 Speedvale Avenue East",
    city: "Guelph",
    province: "ON",
    postalCode: "N1E 1N5",
    verificationSource: "LCBO official store directory"
  },
  {
    name: "LCBO - Scottsdale & Stone",
    pickupType: "LCBO",
    addressLine1: "615 Scottsdale Drive",
    city: "Guelph",
    province: "ON",
    postalCode: "N1G 3P4",
    verificationSource: "LCBO official store directory"
  },
  {
    name: "LCBO - Clair & Gordon",
    pickupType: "LCBO",
    addressLine1: "50 Clair Road East",
    city: "Guelph",
    province: "ON",
    postalCode: "N1L 0G6",
    verificationSource: "LCBO official store directory"
  },
  {
    name: "LCBO - Paisley & Imperial",
    pickupType: "LCBO",
    addressLine1: "995 Paisley Road",
    city: "Guelph",
    province: "ON",
    postalCode: "N1K 1X6",
    verificationSource: "LCBO official store directory"
  },
  {
    name: "The Beer Store - Municipal Street",
    pickupType: "BEER_STORE",
    addressLine1: "15 Municipal Street",
    city: "Guelph",
    province: "ON",
    postalCode: "N1G 1G8",
    verificationSource: "The Beer Store / current Guelph directory listings"
  },
  {
    name: "The Beer Store - Silvercreek Parkway North",
    pickupType: "BEER_STORE",
    addressLine1: "111 Silvercreek Parkway North",
    city: "Guelph",
    province: "ON",
    postalCode: "N1H 3T2",
    verificationSource: "The Beer Store / current Guelph directory listings"
  },
  {
    name: "The Beer Store - Woolwich Street",
    pickupType: "BEER_STORE",
    addressLine1: "710 Woolwich Street",
    city: "Guelph",
    province: "ON",
    postalCode: "N1H 3Z1",
    verificationSource: "The Beer Store / current Guelph directory listings"
  },
  {
    name: "The Beer Store - Clair Road East",
    pickupType: "BEER_STORE",
    addressLine1: "63 Clair Road East",
    city: "Guelph",
    province: "ON",
    postalCode: "N1L 0J4",
    verificationSource: "The Beer Store / current Guelph directory listings"
  }
] as const;

import type { PickupTypeValue } from "../constants/pickupTypes";

export type SeedPickupLocation = {
  name: string;
  pickupType: Exclude<PickupTypeValue, "UNKNOWN">;
  addressLine1: string;
  city: "Guelph";
  province: "ON";
  postalCode?: string;
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
  },

  {
    name: "Canja - Surrey Street East",
    pickupType: "DISPENSARY",
    addressLine1: "83 Surrey Street East",
    city: "Guelph",
    province: "ON",
    postalCode: "N1H 3P7",
    verificationSource: "Canja official website and current licensed-store directory"
  },
  {
    name: "Canna Cabana - Woodlawn",
    pickupType: "DISPENSARY",
    addressLine1: "3 Woodlawn Road West",
    city: "Guelph",
    province: "ON",
    postalCode: "N1H 1G8",
    verificationSource: "Canna Cabana official store locator"
  },
  {
    name: "Canna Cabana - Silvercreek",
    pickupType: "DISPENSARY",
    addressLine1: "106 Silvercreek Parkway North Unit 1",
    city: "Guelph",
    province: "ON",
    postalCode: "N1H 7L6",
    verificationSource: "Canna Cabana official store locator"
  },
  {
    name: "FIKA Cannabis - Gordon Street",
    pickupType: "DISPENSARY",
    addressLine1: "89 Gordon Street Unit C3",
    city: "Guelph",
    province: "ON",
    postalCode: "N1H 4H7",
    verificationSource: "Current licensed-store directory and current business listing"
  },
  {
    name: "Fire & Flower - Stone Square Centre",
    pickupType: "DISPENSARY",
    addressLine1: "314 Stone Road West",
    city: "Guelph",
    province: "ON",
    postalCode: "N1G 3C4",
    verificationSource: "Current licensed-store directory and current business listing"
  },
  {
    name: "Fire & Flower - Pergola Commons",
    pickupType: "DISPENSARY",
    addressLine1: "79 Clair Road East Unit 104",
    city: "Guelph",
    province: "ON",
    postalCode: "N1L 0A6",
    verificationSource: "Current licensed-store directory"
  },
  {
    name: "HighLife Cannabis - Wyndham Street North",
    pickupType: "DISPENSARY",
    addressLine1: "128 Wyndham Street North",
    city: "Guelph",
    province: "ON",
    postalCode: "N1H 4E8",
    verificationSource: "Current licensed-store directory and current business listing"
  },
  {
    name: "J. Supply Co. - Gordon Street",
    pickupType: "DISPENSARY",
    addressLine1: "1515 Gordon Street Unit 106",
    city: "Guelph",
    province: "ON",
    verificationSource: "Current licensed-store directory and J. Supply official website"
  },
  {
    name: "Kraft Cannabis Co. - Woolwich Street",
    pickupType: "DISPENSARY",
    addressLine1: "666 Woolwich Street Unit 30",
    city: "Guelph",
    province: "ON",
    postalCode: "N1H 7G5",
    verificationSource: "Kraft Cannabis official website"
  },
  {
    name: "Matchbox Cannabis - Harvard Road",
    pickupType: "DISPENSARY",
    addressLine1: "35 Harvard Road Unit 7A",
    city: "Guelph",
    province: "ON",
    postalCode: "N1G 3A2",
    verificationSource: "Current licensed-store directory and current business listing"
  },
  {
    name: "PUR Cannabis - Wyndham Street North",
    pickupType: "DISPENSARY",
    addressLine1: "37A Wyndham Street North",
    city: "Guelph",
    province: "ON",
    postalCode: "N1H 4E4",
    verificationSource: "PUR Cannabis official locations page"
  },
  {
    name: "Pure North Cannabis Co. - Woolwich Street",
    pickupType: "DISPENSARY",
    addressLine1: "783 Woolwich Street",
    city: "Guelph",
    province: "ON",
    postalCode: "N1H 3Z2",
    verificationSource: "Current licensed-store directory and current business listing"
  },
  {
    name: "Reserved Cannabis - Scottsdale Drive",
    pickupType: "DISPENSARY",
    addressLine1: "615 Scottsdale Drive Unit 2",
    city: "Guelph",
    province: "ON",
    postalCode: "N1G 3P4",
    verificationSource: "Current licensed-store directory and current business listing"
  },
  {
    name: "Ronin Cannabis - Gordon Street",
    pickupType: "DISPENSARY",
    addressLine1: "86 Gordon Street",
    city: "Guelph",
    province: "ON",
    postalCode: "N1H 4H6",
    verificationSource: "Ronin official website and current menu listing"
  },
  {
    name: "Spiritleaf - South Guelph",
    pickupType: "DISPENSARY",
    addressLine1: "492 Edinburgh Road South Unit B2B",
    city: "Guelph",
    province: "ON",
    postalCode: "N1G 4Z1",
    verificationSource: "Spiritleaf official store directory"
  },
  {
    name: "The Cannabist Shop - Woodlawn",
    pickupType: "DISPENSARY",
    addressLine1: "51 Woodlawn Road West Unit 1",
    city: "Guelph",
    province: "ON",
    postalCode: "N1H 1G8",
    verificationSource: "The Cannabist Shop official locations page"
  },
  {
    name: "The Cannabist Shop - Macdonell Street",
    pickupType: "DISPENSARY",
    addressLine1: "69 Macdonell Street",
    city: "Guelph",
    province: "ON",
    postalCode: "N1H 2Z7",
    verificationSource: "The Cannabist Shop official locations page"
  },
  {
    name: "The Green Room Cannabis - Wyndham Street North",
    pickupType: "DISPENSARY",
    addressLine1: "164 Wyndham Street North",
    city: "Guelph",
    province: "ON",
    verificationSource: "The Green Room Cannabis official locations page"
  },
  {
    name: "The Hunny Pot Cannabis Co. - Speedvale Avenue East",
    pickupType: "DISPENSARY",
    addressLine1: "328 Speedvale Avenue East Unit 10",
    city: "Guelph",
    province: "ON",
    postalCode: "N1E 1N5",
    verificationSource: "The Hunny Pot official store directory"
  },
  {
    name: "The Potery - Starwood Drive",
    pickupType: "DISPENSARY",
    addressLine1: "115 Starwood Drive",
    city: "Guelph",
    province: "ON",
    postalCode: "N1E 7J9",
    verificationSource: "Current licensed-store directory and current business listing"
  },
  {
    name: "True North Cannabis Co. - Wellington Street West",
    pickupType: "DISPENSARY",
    addressLine1: "715 Wellington Street West Suite A6",
    city: "Guelph",
    province: "ON",
    verificationSource: "True North official store selector and current licensed-store directory"
  },
  {
    name: "True North Cannabis Co. - Gordon Street",
    pickupType: "DISPENSARY",
    addressLine1: "951 Gordon Street Unit 8B",
    city: "Guelph",
    province: "ON",
    postalCode: "N1G 4S1",
    verificationSource: "True North official store selector and current licensed-store directory"
  },
  {
    name: "Value Buds - Gordon Street",
    pickupType: "DISPENSARY",
    addressLine1: "73 Gordon Street",
    city: "Guelph",
    province: "ON",
    postalCode: "N1H 4H5",
    verificationSource: "Current licensed-store directory"
  },

  {
    name: "E-Cigz Vape Shop - Gordon Street",
    pickupType: "VAPE",
    addressLine1: "86 Gordon Street Unit F",
    city: "Guelph",
    province: "ON",
    postalCode: "N1H 4H6",
    verificationSource: "Current Guelph business listing"
  },
  {
    name: "Royal Vapes - Gordon Street",
    pickupType: "VAPE",
    addressLine1: "1515 Gordon Street Unit 106",
    city: "Guelph",
    province: "ON",
    postalCode: "N1L 1C9",
    verificationSource: "Current Guelph business listing"
  },
  {
    name: "6ix Vape - Woodlawn",
    pickupType: "VAPE",
    addressLine1: "484 Woodlawn Road East",
    city: "Guelph",
    province: "ON",
    postalCode: "N1E 1B9",
    verificationSource: "6ix Vape official store directory"
  },
  {
    name: "Savage Cloud Vape Shop - Speedvale Avenue East",
    pickupType: "VAPE",
    addressLine1: "483 Speedvale Avenue East",
    city: "Guelph",
    province: "ON",
    postalCode: "N1E 6J2",
    verificationSource: "Current Guelph business listing"
  },
  {
    name: "Rock Affair Inc. - Macdonell Street",
    pickupType: "VAPE",
    addressLine1: "30 Macdonell Street",
    city: "Guelph",
    province: "ON",
    postalCode: "N1H 2Z3",
    verificationSource: "Current Guelph business listing"
  },
  {
    name: "Wild Vape Stop - Cork Street East",
    pickupType: "VAPE",
    addressLine1: "49 Cork Street East",
    city: "Guelph",
    province: "ON",
    postalCode: "N1H 2W7",
    verificationSource: "Wild Vape Stop official website"
  },
  {
    name: "Guelph Vapour Company - Scottsdale Drive",
    pickupType: "VAPE",
    addressLine1: "650 Scottsdale Drive Unit 3B",
    city: "Guelph",
    province: "ON",
    postalCode: "N1G 3M2",
    verificationSource: "Current Guelph business listing"
  }
] as const;

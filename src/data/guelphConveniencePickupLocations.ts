import type { SeedPickupLocation } from "./guelphPickupLocations";

export const GUELPH_CONVENIENCE_PICKUP_LOCATIONS: readonly SeedPickupLocation[] = [
  {
    name: "Farah Market Express - Woodlawn Road East",
    pickupType: "CONVENIENCE",
    addressLine1: "484 Woodlawn Road East",
    city: "Guelph",
    province: "ON",
    postalCode: "N1E 1B9",
    verificationSource: "Farah Foods official locations page and current business listing"
  },
  {
    name: "Farah Market Express - Starwood Drive",
    pickupType: "CONVENIENCE",
    addressLine1: "235 Starwood Drive Unit 1",
    city: "Guelph",
    province: "ON",
    verificationSource: "Current business listing and current FedEx OnSite directory"
  },
  {
    name: "Quickie Convenience - Gordon Street",
    pickupType: "CONVENIENCE",
    addressLine1: "90 Gordon Street",
    city: "Guelph",
    province: "ON",
    postalCode: "N1H 4H6",
    verificationSource: "Current Guelph business listing"
  },
  {
    name: "Quickie Convenience - Woolwich Street",
    pickupType: "CONVENIENCE",
    addressLine1: "666 Woolwich Street",
    city: "Guelph",
    province: "ON",
    postalCode: "N1H 7G5",
    verificationSource: "Current Guelph business listing"
  },
  {
    name: "Simply Convenient - Gordon Street",
    pickupType: "CONVENIENCE",
    addressLine1: "1219 Gordon Street Unit C",
    city: "Guelph",
    province: "ON",
    postalCode: "N1L 0M9",
    verificationSource: "Current Guelph business listing"
  },
  {
    name: "York Convenience - York Road",
    pickupType: "CONVENIENCE",
    addressLine1: "220 York Road",
    city: "Guelph",
    province: "ON",
    postalCode: "N1E 3G2",
    verificationSource: "Current Guelph business listing"
  },
  {
    name: "Gordon Convenience - Gordon Street",
    pickupType: "CONVENIENCE",
    addressLine1: "21 Gordon Street",
    city: "Guelph",
    province: "ON",
    postalCode: "N1H 4G8",
    verificationSource: "Current Guelph business listing"
  },
  {
    name: "A Quick Stop Variety - Yorkshire Street North",
    pickupType: "CONVENIENCE",
    addressLine1: "204 Yorkshire Street North",
    city: "Guelph",
    province: "ON",
    postalCode: "N1H 5C1",
    verificationSource: "Current local directory and Ontario retail licence listing"
  },
  {
    name: "Willow Convenience - Willow Road",
    pickupType: "CONVENIENCE",
    addressLine1: "40 Willow Road",
    city: "Guelph",
    province: "ON",
    postalCode: "N1H 1W2",
    verificationSource: "Current local directory and Ontario retail licence listing"
  },
  {
    name: "Hasty Market - Arkell Road",
    pickupType: "CONVENIENCE",
    addressLine1: "403 Arkell Road Unit 1",
    city: "Guelph",
    province: "ON",
    postalCode: "N1L 1E5",
    verificationSource: "City of Guelph current vendor directory and Ontario retail licence listing"
  },
  {
    name: "Hasty Market - Kortright Road West",
    pickupType: "CONVENIENCE",
    addressLine1: "210 Kortright Road West",
    city: "Guelph",
    province: "ON",
    verificationSource: "City of Guelph current vendor directory"
  },
  {
    name: "Circle K - Paisley Road",
    pickupType: "CONVENIENCE",
    addressLine1: "926 Paisley Road",
    city: "Guelph",
    province: "ON",
    postalCode: "N1K 1X5",
    verificationSource: "Circle K current Canadian store list and current business listing"
  },
  {
    name: "Circle K - Gordon Street",
    pickupType: "CONVENIENCE",
    addressLine1: "987 Gordon Street",
    city: "Guelph",
    province: "ON",
    postalCode: "N1G 4W3",
    verificationSource: "Circle K current Canadian store list and 2026 public-health listing"
  },
  {
    name: "Circle K - College Avenue West",
    pickupType: "CONVENIENCE",
    addressLine1: "138 College Avenue West",
    city: "Guelph",
    province: "ON",
    postalCode: "N1G 1S4",
    verificationSource: "Circle K current Canadian store list and 2026 public-health listing"
  },
  {
    name: "Esso / Circle K - Woodlawn Road West",
    pickupType: "CONVENIENCE",
    addressLine1: "435 Woodlawn Road West",
    city: "Guelph",
    province: "ON",
    postalCode: "N1K 1E9",
    verificationSource: "2026 Wellington-Dufferin-Guelph public-health listing"
  },
  {
    name: "Retro Convenience - Waterloo Avenue",
    pickupType: "CONVENIENCE",
    addressLine1: "196 Waterloo Avenue",
    city: "Guelph",
    province: "ON",
    postalCode: "N1H 3J3",
    verificationSource: "Current U-Haul neighborhood dealer directory"
  },
  {
    name: "Guelph Mart - Speedvale Avenue East",
    pickupType: "CONVENIENCE",
    addressLine1: "543 Speedvale Avenue East",
    city: "Guelph",
    province: "ON",
    postalCode: "N1E 1P7",
    verificationSource: "Current Guelph business listing"
  }
] as const;

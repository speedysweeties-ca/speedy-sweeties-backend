export type PickupDryRunLocation = {
  name: string;
  pickupType: "LCBO" | "BEER_STORE" | "DISPENSARY" | "VAPE" | "CONVENIENCE";
  addressLine1: string;
  city: "Guelph";
  province: "ON";
  postalCode?: string;
};

const l = (name: string, pickupType: PickupDryRunLocation["pickupType"], addressLine1: string, postalCode?: string): PickupDryRunLocation => ({ name, pickupType, addressLine1, city: "Guelph", province: "ON", postalCode });

export const GUELPH_PICKUP_DRY_RUN_LOCATIONS: readonly PickupDryRunLocation[] = [
  l("LCBO - Wellington & Gordon", "LCBO", "16 Wellington Street West", "N1H 3R9"),
  l("LCBO - Speedvale & Stevenson", "LCBO", "378 Speedvale Avenue East", "N1E 1N5"),
  l("LCBO - Scottsdale & Stone", "LCBO", "615 Scottsdale Drive", "N1G 3P4"),
  l("LCBO - Clair & Gordon", "LCBO", "50 Clair Road East", "N1L 0G6"),
  l("LCBO - Paisley & Imperial", "LCBO", "995 Paisley Road", "N1K 1X6"),
  l("The Beer Store - Municipal Street", "BEER_STORE", "15 Municipal Street", "N1G 1G8"),
  l("The Beer Store - Silvercreek Parkway North", "BEER_STORE", "111 Silvercreek Parkway North", "N1H 3T2"),
  l("The Beer Store - Woolwich Street", "BEER_STORE", "710 Woolwich Street", "N1H 3Z1"),
  l("The Beer Store - Clair Road East", "BEER_STORE", "63 Clair Road East", "N1L 0J4"),
  l("Canja - Surrey Street East", "DISPENSARY", "83 Surrey Street East", "N1H 3P7"),
  l("Canna Cabana - Woodlawn", "DISPENSARY", "3 Woodlawn Road West", "N1H 1G8"),
  l("Canna Cabana - Silvercreek", "DISPENSARY", "106 Silvercreek Parkway North Unit 1", "N1H 7L6"),
  l("FIKA Cannabis - Gordon Street", "DISPENSARY", "89 Gordon Street Unit C3", "N1H 4H7"),
  l("Fire & Flower - Stone Square Centre", "DISPENSARY", "314 Stone Road West", "N1G 3C4"),
  l("Fire & Flower - Pergola Commons", "DISPENSARY", "79 Clair Road East Unit 104", "N1L 0A6"),
  l("HighLife Cannabis - Wyndham Street North", "DISPENSARY", "128 Wyndham Street North", "N1H 4E8"),
  l("J. Supply Co. - Gordon Street", "DISPENSARY", "1515 Gordon Street Unit 106"),
  l("Kraft Cannabis Co. - Woolwich Street", "DISPENSARY", "666 Woolwich Street Unit 30", "N1H 7G5"),
  l("Matchbox Cannabis - Harvard Road", "DISPENSARY", "35 Harvard Road Unit 7A", "N1G 3A2"),
  l("PUR Cannabis - Wyndham Street North", "DISPENSARY", "37A Wyndham Street North", "N1H 4E4"),
  l("Pure North Cannabis Co. - Woolwich Street", "DISPENSARY", "783 Woolwich Street", "N1H 3Z2"),
  l("Reserved Cannabis - Scottsdale Drive", "DISPENSARY", "615 Scottsdale Drive Unit 2", "N1G 3P4"),
  l("Ronin Cannabis - Gordon Street", "DISPENSARY", "86 Gordon Street", "N1H 4H6"),
  l("Spiritleaf - South Guelph", "DISPENSARY", "492 Edinburgh Road South Unit B2B", "N1G 4Z1"),
  l("The Cannabist Shop - Woodlawn", "DISPENSARY", "51 Woodlawn Road West Unit 1", "N1H 1G8"),
  l("The Cannabist Shop - Macdonell Street", "DISPENSARY", "69 Macdonell Street", "N1H 2Z7"),
  l("The Green Room Cannabis - Wyndham Street North", "DISPENSARY", "164 Wyndham Street North"),
  l("The Hunny Pot Cannabis Co. - Speedvale Avenue East", "DISPENSARY", "328 Speedvale Avenue East Unit 10", "N1E 1N5"),
  l("The Potery - Starwood Drive", "DISPENSARY", "115 Starwood Drive", "N1E 7J9"),
  l("True North Cannabis Co. - Wellington Street West", "DISPENSARY", "715 Wellington Street West Suite A6"),
  l("True North Cannabis Co. - Gordon Street", "DISPENSARY", "951 Gordon Street Unit 8B", "N1G 4S1"),
  l("Value Buds - Gordon Street", "DISPENSARY", "73 Gordon Street", "N1H 4H5"),
  l("E-Cigz Vape Shop - Gordon Street", "VAPE", "86 Gordon Street Unit F", "N1H 4H6"),
  l("Royal Vapes - Gordon Street", "VAPE", "1515 Gordon Street Unit 106", "N1L 1C9"),
  l("6ix Vape - Woodlawn", "VAPE", "484 Woodlawn Road East", "N1E 1B9"),
  l("Savage Cloud Vape Shop - Speedvale Avenue East", "VAPE", "483 Speedvale Avenue East", "N1E 6J2"),
  l("Rock Affair Inc. - Macdonell Street", "VAPE", "30 Macdonell Street", "N1H 2Z3"),
  l("Wild Vape Stop - Cork Street East", "VAPE", "49 Cork Street East", "N1H 2W7"),
  l("Guelph Vapour Company - Scottsdale Drive", "VAPE", "650 Scottsdale Drive Unit 3B", "N1G 3M2"),
  l("Farah Market Express - Woodlawn Road East", "CONVENIENCE", "484 Woodlawn Road East", "N1E 1B9"),
  l("Farah Market Express - Starwood Drive", "CONVENIENCE", "235 Starwood Drive Unit 1"),
  l("Quickie Convenience - Gordon Street", "CONVENIENCE", "90 Gordon Street", "N1H 4H6"),
  l("Quickie Convenience - Woolwich Street", "CONVENIENCE", "666 Woolwich Street", "N1H 7G5"),
  l("Simply Convenient - Gordon Street", "CONVENIENCE", "1219 Gordon Street Unit C", "N1L 0M9"),
  l("York Convenience - York Road", "CONVENIENCE", "220 York Road", "N1E 3G2"),
  l("Gordon Convenience - Gordon Street", "CONVENIENCE", "21 Gordon Street", "N1H 4G8"),
  l("A Quick Stop Variety - Yorkshire Street North", "CONVENIENCE", "204 Yorkshire Street North", "N1H 5C1"),
  l("Willow Convenience - Willow Road", "CONVENIENCE", "40 Willow Road", "N1H 1W2"),
  l("Quickie - Willow Road", "CONVENIENCE", "61 Willow Rd", "N1H 1W3"),
  l("Hasty Market - Arkell Road", "CONVENIENCE", "403 Arkell Road Unit 1", "N1L 1E5"),
  l("Hasty Market - Kortright Road West", "CONVENIENCE", "210 Kortright Road West"),
  l("Circle K - Paisley Road", "CONVENIENCE", "926 Paisley Road", "N1K 1X5"),
  l("Circle K - Gordon Street", "CONVENIENCE", "987 Gordon Street", "N1G 4W3"),
  l("Circle K - College Avenue West", "CONVENIENCE", "138 College Avenue West", "N1G 1S4"),
  l("Esso / Circle K - Woodlawn Road West", "CONVENIENCE", "435 Woodlawn Road West", "N1K 1E9"),
  l("Retro Convenience - Waterloo Avenue", "CONVENIENCE", "196 Waterloo Avenue", "N1H 3J3"),
  l("Guelph Mart - Speedvale Avenue East", "CONVENIENCE", "543 Speedvale Avenue East", "N1E 1P7")
] as const;

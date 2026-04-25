import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.itemCatalog.createMany({
    data: [
      { name: "Smirnoff 375ml", normalizedName: "smirnoff 375ml" },
      { name: "Smirnoff 750ml", normalizedName: "smirnoff 750ml" },
      { name: "Smirnoff 1L", normalizedName: "smirnoff 1l" },
      { name: "Budweiser 6 Pack", normalizedName: "budweiser 6 pack" },
      { name: "Budweiser 12 Pack", normalizedName: "budweiser 12 pack" },
      { name: "Coors Light 6 Pack", normalizedName: "coors light 6 pack" },
      { name: "Coors Light 12 Pack", normalizedName: "coors light 12 pack" },
      { name: "Corona 6 Pack", normalizedName: "corona 6 pack" },
      { name: "Corona 12 Pack", normalizedName: "corona 12 pack" },
      { name: "Grey Goose 375ml", normalizedName: "grey goose 375ml" },
      { name: "Grey Goose 750ml", normalizedName: "grey goose 750ml" }
    ]
  });

  console.log("Seeded items");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
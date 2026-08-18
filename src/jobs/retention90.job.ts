import { prisma } from "../lib/prisma";

const RETENTION_TRIGGER_DAYS = 90;
const EXISTING_BUSINESS_RELATIONSHIP_DAYS = 730;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const SMS_MODE = (process.env.RETENTION_SMS_MODE || "DRY_RUN").trim().toUpperCase();

const MESSAGE_BODY =
  "Speedy Sweeties: It's been a while! We'd love to deliver for you again. Order at speedysweeties.ca or call 519-826-8097. Reply STOP to unsubscribe.";

const normalizeCanadianPhone = (value: string): string | null => {
  const digits = value.replace(/\D/g, "");

  if (digits.length === 10) {
    return `+1${digits}`;
  }

  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }

  return null;
};

const addDays = (value: Date, days: number): Date =>
  new Date(value.getTime() + days * MILLISECONDS_PER_DAY);

const getLatestCompletedOrderDate = (
  orders: Array<{ deliveredAt: Date | null; createdAt: Date }>
): Date | null => {
  const dates = orders
    .map((order) => order.deliveredAt || order.createdAt)
    .filter((value): value is Date => Boolean(value))
    .sort((a, b) => b.getTime() - a.getTime());

  return dates[0] || null;
};

async function runRetention90Job(): Promise<void> {
  if (SMS_MODE !== "DRY_RUN") {
    throw new Error(
      `RETENTION_SMS_MODE=${SMS_MODE} is not enabled in Phase 3A. This job intentionally supports DRY_RUN only so no SMS can be sent accidentally.`
    );
  }

  const now = new Date();
  const customers = await prisma.customer.findMany({
    where: {
      smsMarketingOptOut: false,
      orders: {
        some: {
          orderStatus: "DELIVERED",
        },
      },
    },
    select: {
      id: true,
      fullName: true,
      phone: true,
      smsMarketingOptOut: true,
      smsExpressConsentAt: true,
      smsExpressConsentSource: true,
      orders: {
        where: {
          orderStatus: "DELIVERED",
        },
        select: {
          deliveredAt: true,
          createdAt: true,
        },
      },
    },
  });

  const candidates: Array<{
    customerId: string;
    triggerDays: number;
    inactivityAnchorAt: Date;
    eligibleAt: Date;
    phone: string;
    messageBody: string;
    status: "DRY_RUN";
    consentBasis: string;
  }> = [];

  let skippedNotYet90Days = 0;
  let skippedInvalidPhone = 0;
  let skippedOutsideConsentWindow = 0;

  for (const customer of customers) {
    const lastOrderAt = getLatestCompletedOrderDate(customer.orders);

    if (!lastOrderAt) {
      continue;
    }

    const eligibleAt = addDays(lastOrderAt, RETENTION_TRIGGER_DAYS);

    if (eligibleAt.getTime() > now.getTime()) {
      skippedNotYet90Days += 1;
      continue;
    }

    const normalizedPhone = normalizeCanadianPhone(customer.phone);

    if (!normalizedPhone) {
      skippedInvalidPhone += 1;
      continue;
    }

    const hasExpressConsent = Boolean(customer.smsExpressConsentAt);
    const existingBusinessRelationshipExpiresAt = addDays(
      lastOrderAt,
      EXISTING_BUSINESS_RELATIONSHIP_DAYS
    );
    const withinExistingBusinessRelationshipWindow =
      existingBusinessRelationshipExpiresAt.getTime() >= now.getTime();

    if (!hasExpressConsent && !withinExistingBusinessRelationshipWindow) {
      skippedOutsideConsentWindow += 1;
      continue;
    }

    const consentBasis = hasExpressConsent
      ? `EXPRESS${
          customer.smsExpressConsentSource
            ? `:${customer.smsExpressConsentSource}`
            : ""
        }`
      : "EXISTING_BUSINESS_RELATIONSHIP";

    candidates.push({
      customerId: customer.id,
      triggerDays: RETENTION_TRIGGER_DAYS,
      inactivityAnchorAt: lastOrderAt,
      eligibleAt,
      phone: normalizedPhone,
      messageBody: MESSAGE_BODY,
      status: "DRY_RUN",
      consentBasis,
    });
  }

  const result =
    candidates.length > 0
      ? await prisma.retentionMessage.createMany({
          data: candidates,
          skipDuplicates: true,
        })
      : { count: 0 };

  console.log("90-day retention job completed in DRY_RUN mode.");
  console.log(`Customers reviewed: ${customers.length}`);
  console.log(`Eligible 90-day candidates: ${candidates.length}`);
  console.log(`New dry-run records created: ${result.count}`);
  console.log(`Skipped - not yet 90 days: ${skippedNotYet90Days}`);
  console.log(`Skipped - invalid phone: ${skippedInvalidPhone}`);
  console.log(
    `Skipped - outside 2-year existing-business-relationship window without recorded express consent: ${skippedOutsideConsentWindow}`
  );
  console.log("SMS messages sent: 0");
}

async function main(): Promise<void> {
  try {
    await prisma.$connect();
    await runRetention90Job();
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("90-day retention job failed:", error);
  process.exit(1);
});
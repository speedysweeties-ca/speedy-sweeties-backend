export type VerificationChannel = "EMAIL" | "PHONE";

export type VerificationDelivery = {
  start(input: { channel: VerificationChannel; to: string; code: string; id: string }): Promise<{ reference?: string }>;
  check(input: { channel: VerificationChannel; to: string; code: string; reference?: string }): Promise<boolean>;
};

type DeliveryConfig = {
  resendApiKey: string;
  resendFrom: string;
  emailEnabled: boolean;
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioVerifyServiceSid: string;
  phoneEnabled: boolean;
};

const verificationText = (code: string) =>
  `Your Speedy Sweeties privacy verification code is ${code}. It expires in 10 minutes. This code does not delete your account. Do not share it.`;

export function privacyVerificationDelivery(config: DeliveryConfig, fetcher: typeof fetch = fetch): VerificationDelivery {
  const twilioUrl = (suffix: string) =>
    `https://verify.twilio.com/v2/Services/${encodeURIComponent(config.twilioVerifyServiceSid)}${suffix}`;
  const twilioHeaders = () => ({
    Authorization: `Basic ${Buffer.from(`${config.twilioAccountSid}:${config.twilioAuthToken}`).toString("base64")}`,
    "Content-Type": "application/x-www-form-urlencoded"
  });

  return {
    async start({ channel, to, code, id }) {
      if (channel === "EMAIL") {
        if (!config.emailEnabled || !config.resendApiKey || !config.resendFrom) {
          throw new Error("Verification delivery unavailable");
        }
        const result = await fetcher("https://api.resend.com/emails", {
          method: "POST",
          signal: AbortSignal.timeout(10_000),
          headers: {
            Authorization: `Bearer ${config.resendApiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": `privacy-${id}`
          },
          body: JSON.stringify({
            from: config.resendFrom,
            to: [to],
            subject: "Speedy Sweeties privacy verification",
            text: verificationText(code)
          })
        });
        if (!result.ok) throw new Error("Verification delivery unavailable");
        return {};
      }

      if (!config.phoneEnabled || !config.twilioAccountSid || !config.twilioAuthToken || !config.twilioVerifyServiceSid) {
        throw new Error("Verification delivery unavailable");
      }
      const result = await fetcher(twilioUrl("/Verifications"), {
        method: "POST",
        signal: AbortSignal.timeout(10_000),
        headers: twilioHeaders(),
        body: new URLSearchParams({ To: to, Channel: "sms" })
      });
      if (!result.ok) throw new Error("Verification delivery unavailable");
      const payload = await result.json() as { sid?: unknown; status?: unknown };
      if (typeof payload.sid !== "string" || payload.status !== "pending") {
        throw new Error("Verification delivery unavailable");
      }
      return { reference: payload.sid };
    },

    async check({ channel, to, code, reference }) {
      if (channel === "EMAIL") return true;
      if (!config.phoneEnabled || !config.twilioAccountSid || !config.twilioAuthToken || !config.twilioVerifyServiceSid || !reference) {
        return false;
      }
      const result = await fetcher(twilioUrl("/VerificationCheck"), {
        method: "POST",
        signal: AbortSignal.timeout(10_000),
        headers: twilioHeaders(),
        body: new URLSearchParams({ To: to, Code: code })
      });
      if (!result.ok) return false;
      const payload = await result.json() as { status?: unknown };
      return payload.status === "approved";
    }
  };
}

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

export type VerificationDeliveryDiagnostic = {
  provider: "twilio" | "resend";
  operation: "start" | "check";
  outcome: "accepted" | "rejected" | "timeout" | "network_error" | "invalid_response";
  httpStatus?: number;
  errorCode?: number;
};

type DiagnosticReporter = (diagnostic: VerificationDeliveryDiagnostic) => void;

const safeProviderCode = async (result: Response) => {
  try {
    const payload = await result.clone().json() as { code?: unknown };
    const code = typeof payload.code === "number" ? payload.code : Number(payload.code);
    return Number.isSafeInteger(code) && code >= 0 ? code : undefined;
  } catch { return undefined; }
};

const isTimeout = (error: unknown) => error instanceof Error &&
  (error.name === "TimeoutError" || error.name === "AbortError");

const defaultReporter: DiagnosticReporter = diagnostic => {
  // This deliberately excludes destinations, credentials, SIDs, OTPs and response bodies.
  console.warn(`[privacy-verification-provider] ${JSON.stringify(diagnostic)}`);
};

const verificationText = (code: string) =>
  `Your Speedy Sweeties privacy verification code is ${code}. It expires in 10 minutes. This code does not delete your account. Do not share it.`;

export function privacyVerificationDelivery(config: DeliveryConfig, fetcher: typeof fetch = fetch,
  report: DiagnosticReporter = defaultReporter): VerificationDelivery {
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
        try {
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
          if (!result.ok) {
            report({ provider: "resend", operation: "start", outcome: "rejected",
              httpStatus: result.status, errorCode: await safeProviderCode(result) });
            throw new Error("Verification delivery unavailable");
          }
          const payload = await result.json() as { id?: unknown };
          if (typeof payload.id !== "string" || !payload.id.trim() || payload.id.length > 200) {
            report({ provider: "resend", operation: "start", outcome: "invalid_response", httpStatus: result.status });
            throw new Error("Verification delivery unavailable");
          }
          report({ provider: "resend", operation: "start", outcome: "accepted", httpStatus: result.status });
          return { reference: payload.id };
        } catch (error) {
          if (error instanceof Error && error.message === "Verification delivery unavailable") throw error;
          report({ provider: "resend", operation: "start", outcome: isTimeout(error) ? "timeout" : "network_error" });
          throw new Error("Verification delivery unavailable");
        }
      }

      if (!config.phoneEnabled || !config.twilioAccountSid || !config.twilioAuthToken || !config.twilioVerifyServiceSid) {
        throw new Error("Verification delivery unavailable");
      }
      try {
        const result = await fetcher(twilioUrl("/Verifications"), {
          method: "POST",
          signal: AbortSignal.timeout(10_000),
          headers: twilioHeaders(),
          body: new URLSearchParams({ To: to, Channel: "sms" })
        });
        if (!result.ok) {
          report({ provider: "twilio", operation: "start", outcome: "rejected",
            httpStatus: result.status, errorCode: await safeProviderCode(result) });
          throw new Error("Verification delivery unavailable");
        }
        const payload = await result.json() as { sid?: unknown; status?: unknown };
        if (typeof payload.sid !== "string" || payload.status !== "pending") {
          report({ provider: "twilio", operation: "start", outcome: "invalid_response", httpStatus: result.status });
          throw new Error("Verification delivery unavailable");
        }
        report({ provider: "twilio", operation: "start", outcome: "accepted", httpStatus: result.status });
        return { reference: payload.sid };
      } catch (error) {
        if (error instanceof Error && error.message === "Verification delivery unavailable") throw error;
        report({ provider: "twilio", operation: "start", outcome: isTimeout(error) ? "timeout" : "network_error" });
        throw new Error("Verification delivery unavailable");
      }
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

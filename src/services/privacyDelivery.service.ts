import type { Delivery } from "./privacyDeletion.service";

// Uses the already-integrated Resend transport, never a new provider/account.
// The caller may supply only a pre-existing, independently verified contact.
export function resendPrivacyDelivery(config: { apiKey: string; from: string; enabled: boolean }, fetcher: typeof fetch = fetch): Delivery {
  return async ({ to, code, id }) => {
    if (!config.enabled || !config.apiKey || !config.from) throw new Error("Verification delivery unavailable");
    const result = await fetcher("https://api.resend.com/emails", {
      method: "POST", signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `privacy-${id}` },
      body: JSON.stringify({ from: config.from, to: [to], subject: "Speedy Sweeties privacy verification",
        text: `Your privacy-request verification code is ${code}. It expires in 10 minutes. This code does not delete your account. If you did not request it, ignore this email. Do not share it with anyone.` })
    });
    if (!result.ok) throw new Error("Verification delivery unavailable");
  };
}

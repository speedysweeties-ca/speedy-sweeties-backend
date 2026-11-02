import { env } from "../config/env";

export class WebsiteVerificationError extends Error {
  constructor(public readonly unavailable = false) {
    super(unavailable
      ? "Human verification is unavailable. No order was sent. Please retry or call 519-826-8097."
      : "Please complete human verification again before submitting your order.");
  }
}

export async function verifyWebsiteToken(
  token: unknown,
  options: { secret?: string; fetchImplementation?: typeof fetch } = {}
): Promise<void> {
  if (typeof token !== "string" || !token.trim() || token.length > 2048) {
    throw new WebsiteVerificationError();
  }
  const secret = options.secret ?? env.TURNSTILE_SECRET_KEY;
  if (!secret) throw new WebsiteVerificationError(true);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await (options.fetchImplementation ?? fetch)(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ secret, response: token }),
        signal: controller.signal
      }
    );
    if (!response.ok) throw new WebsiteVerificationError(true);
    const result = await response.json() as Record<string, unknown>;
    if (!result || typeof result !== "object" || typeof result.success !== "boolean") {
      throw new WebsiteVerificationError(true);
    }
    if (Array.isArray(result["error-codes"]) && result["error-codes"].some(
      code => ["internal-error", "missing-input-secret", "invalid-input-secret"].includes(String(code))
    )) throw new WebsiteVerificationError(true);
    const challengeTime = typeof result.challenge_ts === "string" ? Date.parse(result.challenge_ts) : NaN;
    const age = Date.now() - challengeTime;
    if (result.success !== true || result.hostname !== "www.speedysweeties.ca" ||
        result.action !== "website_order" || !Number.isFinite(age) || age < -30_000 || age > 300_000) {
      throw new WebsiteVerificationError();
    }
  } catch (error) {
    if (error instanceof WebsiteVerificationError) throw error;
    // Never log the provider request, token, secret or response body.
    throw new WebsiteVerificationError(true);
  } finally {
    clearTimeout(timeout);
  }
}

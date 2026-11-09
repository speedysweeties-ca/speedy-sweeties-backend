(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else { root.SpeedyS4ReviewerEnrollment = api; void api.runBrowser(); }
})(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";

  const OWNER_ADMIN_USER_ID = "afca21ae-4c43-4c14-a2a7-f3ad790b12dc";
  const SAFE_CONFLICTS = new Set([
    "ENROLLMENT_PRECONDITION", "EXISTING_POLICY", "EXPIRY_ELAPSED", "PROFILE_COLLISION",
    "INVALID_DELIVERY_ADDRESS", "UNUSED_POLICY_CORRECTION_REFUSED"
  ]);
  const API = "https://speedy-api-lbfe.onrender.com";
  const ORIGIN = "https://speedy-dispatcher.onrender.com";
  const ONE_USE_KEY = "SpeedyS4EnrollmentAttempted";

  function safeConflict(body) {
    const code = body && body.details && body.details.code;
    return SAFE_CONFLICTS.has(code) ? code : "UNCLASSIFIED_REFUSAL";
  }
  function validApproval(approval, now) {
    if (!approval || approval.liveEnrollmentAuthorized !== true || approval.currentSourceVerified !== true ||
        approval.maxOrders !== 6 || approval.maxEmails !== 3 || !/^[a-f0-9]{40}$/.test(approval.sourceRevision || "")) return false;
    const start = Date.parse(approval.startedAt), deadline = Date.parse(approval.deadline), expires = Date.parse(approval.expiresAt);
    return [start, deadline, expires].every(Number.isFinite) && now >= start && now < deadline &&
      deadline <= start + 12 * 3600000 && expires > now && expires <= start + 7 * 86400000;
  }
  function serializeOnce(profile, approval) {
    const allowed = ["customerName", "customerPhone", "customerEmail", "addressLine1", "city", "province", "unitNumber", "buzzCode"];
    const object = profile && typeof profile === "object" && !Array.isArray(profile);
    const keys = object ? Object.keys(profile) : [];
    const required = object && allowed.slice(0, 6).every(key => typeof profile[key] === "string" && profile[key].trim() && profile[key].length <= 500);
    const optional = object && allowed.slice(6).every(key => profile[key] === undefined || profile[key] === null || typeof profile[key] === "string");
    const digits = required ? profile.customerPhone.replace(/\D/g, "") : "";
    if (!object || keys.some(key => !allowed.includes(key)) || !required || !optional ||
        !/^(?:1)?[2-9]\d{9}$/.test(digits) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.customerEmail.trim()) ||
        !["on", "ontario"].includes(profile.province.trim().toLowerCase()) || profile.city.trim().toLowerCase() !== "guelph") {
      throw new Error("PRIVATE_PROFILE_STRUCTURE");
    }
    // Serialize exactly once. The same immutable string is sent to the server's
    // read-only collision validation and, only after confirmation, enrollment.
    return JSON.stringify({ ownerConfirmedSynthetic: true, profile, expiresAt: approval.expiresAt,
      maxOrders: approval.maxOrders, maxEmails: approval.maxEmails });
  }
  async function responseJson(response) {
    return response.json().catch(() => ({}));
  }
  async function execute(options) {
    const now = options.now ? options.now() : Date.now();
    if (!validApproval(options.approval, now)) return { pass: false, result: "STOP_SCOPE_OR_PERIOD", enrollmentAttempted: false };
    let serialized = null;
    try {
      serialized = serializeOnce(options.profile, options.approval);
      const headers = { Authorization: "Bearer " + options.token, "Content-Type": "application/json" };
      const request = (path, body, timeout) => options.fetchImpl((options.api || API) + path, {
        method: "POST", headers, credentials: "omit", redirect: "error", cache: "no-store",
        signal: options.timeoutSignal(timeout), body
      });
      const validation = await request("/api/v1/orders/synthetic-safety/validate", serialized, 10000);
      const validationBody = await responseJson(validation);
      if (validation.status !== 200 || validationBody.success !== true || validationBody.eligible !== true) {
        return { pass: false, status: validation.status, category: safeConflict(validationBody),
          result: "STOP_VALIDATION_REFUSED", enrollmentAttempted: false };
      }
      if (!await options.confirmEnrollment()) return { pass: false, result: "CANCELLED_AFTER_VALIDATION", enrollmentAttempted: false };
      options.markOneUse();
      const enrollment = await request("/api/v1/orders/synthetic-safety/enroll", serialized, 10000);
      const enrollmentBody = await responseJson(enrollment);
      if (enrollment.status !== 201) return { pass: false, status: enrollment.status, category: safeConflict(enrollmentBody),
        result: "STOP_ENROLLMENT_REFUSED_NO_RETRY", enrollmentAttempted: true };
      const pass = enrollmentBody.success === true && enrollmentBody.state === "ACTIVE" &&
        enrollmentBody.maxOrders === 6 && enrollmentBody.maxEmails === 3 &&
        enrollmentBody.ordersCreated === 0 && enrollmentBody.emailsClaimed === 0 &&
        Date.parse(enrollmentBody.expiresAt) === Date.parse(options.approval.expiresAt);
      return { pass, state: pass ? "ACTIVE" : "UNVERIFIED", maxOrders: 6, maxEmails: 3,
        ordersCreated: pass ? 0 : undefined, emailsClaimed: pass ? 0 : undefined,
        expiresAt: options.approval.expiresAt, profileValuesEmitted: false,
        result: pass ? "ENROLLMENT_OBSERVED_NO_ORDER_OR_EMAIL_SENT" : "STOP_ENROLLMENT_READBACK_NO_RETRY",
        enrollmentAttempted: true };
    } finally {
      serialized = null;
    }
  }
  function scrub(profile) {
    if (!profile || typeof profile !== "object") return;
    for (const key of Object.keys(profile)) profile[key] = "";
  }
  async function collectProfile(document) {
    const dialog = document.createElement("dialog");
    dialog.style.cssText = "max-width:520px;width:calc(100% - 32px);border:1px solid #777;border-radius:12px;padding:20px;font:16px system-ui;background:white;color:#111";
    const form = document.createElement("form"); form.method = "dialog"; form.autocomplete = "off";
    const title = document.createElement("h2"); title.textContent = "Protected reviewer enrollment";
    const note = document.createElement("p"); note.textContent = "Enter the private profile once. The server validates the exact approved mailbox, collisions and the same civic address rules used by order creation before enrollment. SMS remains disabled.";
    dialog.append(title, note, form);
    const fields = {};
    for (const [key, labelText, required] of [
      ["customerName", "Reviewer name", true], ["customerPhone", "Owner-controlled phone", true],
      ["customerEmail", "Owner-controlled verification email", true], ["addressLine1", "Guelph street address", true],
      ["city", "City", true], ["province", "Province", true], ["unitNumber", "Unit (optional)", false],
      ["buzzCode", "Buzz code (optional)", false]
    ]) {
      const label = document.createElement("label"); label.textContent = labelText; label.style.cssText = "display:block;margin:12px 0 4px;font-weight:600";
      const input = document.createElement("input"); input.type = key === "customerEmail" ? "email" : key === "customerPhone" ? "tel" : "text";
      input.required = required; input.autocomplete = "off"; input.spellcheck = false; input.style.cssText = "box-sizing:border-box;width:100%;padding:9px";
      fields[key] = input; form.append(label, input);
    }
    const cancel = document.createElement("button"); cancel.value = "cancel"; cancel.textContent = "Cancel";
    const validate = document.createElement("button"); validate.value = "validate"; validate.textContent = "Validate once";
    form.append(cancel, validate); document.body.append(dialog); dialog.showModal(); fields.customerName.focus();
    const choice = await new Promise(resolve => dialog.addEventListener("close", () => resolve(dialog.returnValue), { once: true }));
    if (choice !== "validate") { dialog.remove(); return null; }
    const profile = Object.fromEntries(Object.entries(fields).map(([key, input]) => [key, input.value]));
    for (const input of Object.values(fields)) input.value = "";
    dialog.remove(); return profile;
  }
  async function runBrowser() {
    const emit = result => console.log(JSON.stringify({ check: "SPEEDY_S4_ENROLLMENT", executionId: window.SpeedyS4EnrollmentApproval?.executionId, ...result }));
    if (location.origin !== ORIGIN) { emit({ pass: false, result: "WRONG_ORIGIN", enrollmentAttempted: false }); return; }
    if (window[ONE_USE_KEY]) { emit({ pass: false, result: "ONE_USE_REFUSED", enrollmentAttempted: false }); return; }
    let token = null, profile = null;
    try {
      const approval = window.SpeedyS4EnrollmentApproval; delete window.SpeedyS4EnrollmentApproval;
      if (!validApproval(approval, Date.now())) { emit({ pass: false, result: "STOP_SCOPE_OR_PERIOD", enrollmentAttempted: false }); return; }
      token = localStorage.getItem("token"); if (!token) { emit({ pass: false, result: "EXISTING_SIGNIN_REQUIRED", enrollmentAttempted: false }); return; }
      const me = await fetch(API + "/api/v1/auth/me", { method: "GET", headers: { Authorization: "Bearer " + token }, credentials: "omit", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(8000) });
      if (me.status !== 200) { if (me.body) await me.body.cancel(); emit({ pass: false, result: "SESSION_NOT_READY", enrollmentAttempted: false }); return; }
      const user = (await me.json()).user;
      if (user?.id !== OWNER_ADMIN_USER_ID || user.role !== "ADMIN" || user.isActive !== true) { emit({ pass: false, result: "OWNER_ADMIN_REQUIRED", enrollmentAttempted: false }); return; }
      profile = await collectProfile(document); if (!profile) { emit({ pass: false, result: "CANCELLED_NO_REQUEST", enrollmentAttempted: false }); return; }
      const result = await execute({ approval, profile, token, fetchImpl: fetch.bind(window), api: API,
        timeoutSignal: milliseconds => AbortSignal.timeout(milliseconds),
        confirmEnrollment: () => Promise.resolve(window.confirm("Validation passed. Create this one bounded reviewer enrollment now?")),
        markOneUse: () => { window[ONE_USE_KEY] = true; } });
      emit(result);
    } catch (error) {
      emit({ pass: false, result: error?.message === "PRIVATE_PROFILE_STRUCTURE" ? "STOP_PRIVATE_PROFILE_STRUCTURE" : "STOP_ENROLLMENT_WORKFLOW_UNAVAILABLE", enrollmentAttempted: !!window[ONE_USE_KEY] });
    } finally { token = null; scrub(profile); profile = null; }
  }
  return { SAFE_CONFLICTS, execute, runBrowser, serializeOnce, validApproval };
});

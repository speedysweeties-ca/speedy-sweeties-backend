import { withDiagnosticContext, diagnosticContext, logDiagnostic, safeDiagnosticErrorCode } from "../utils/operationalDiagnostics";
import { randomUUID } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

const scopes = new Set([
  "/api/v1", "/api/v1/orders", "/api/v1/addresses", "/api/v1/chatgpt",
  "/api/v1/auth", "/api/v1/customers", "/api/v1/items", "/api/v1/driver",
  "/api/v1/notifications", "/api/v1/test-notification", "/api/v1/business",
  "/api/v1/dispatcher-checklist", "/api/v1/pickup-locations", "/api/v1/routing-preview",
  "/api/v1/ai", "/api/v1/dispatcher-help", "/api/v1/bnd-alerts", "/api/v1/check-in",
  "/api/v1/dispatcher-pinboard", "/api/v1/dispatcher-standards"
]);

export function safeRouteTemplate(req: Request): string {
  // Express's declared route template is safe; the actual URL, path, query,
  // headers and params can contain tracking credentials and must never be logged.
  const route = req.route?.path;
  if (typeof route !== "string" || route.length > 160 || !/^\/[a-zA-Z0-9_/:.*{}-]*$/.test(route)) return "unmatched";
  return `${scopes.has(req.baseUrl) ? req.baseUrl : ""}${route}`;
}

export function requestDiagnostics(req: Request, res: Response, next: NextFunction): void {
  // Do not trust a caller-supplied correlation ID to become log content.
  res.locals.requestId = randomUUID();
  res.set("X-Request-ID", res.locals.requestId);
  const started = Date.now();
  withDiagnosticContext(res.locals.requestId, () => {
    const requestContext = diagnosticContext();
    res.once("finish", () => {
      if (res.statusCode >= 400) logDiagnostic({
        ...requestContext, event: "HTTP_REQUEST_FAILED",
        outcome: res.statusCode >= 500 ? "failed" : "rejected",
        method: req.method, route: safeRouteTemplate(req), status: res.statusCode,
        durationMs: Math.max(0, Date.now() - started)
      });
    });
    next();
  });
}

export function logServerError(error: unknown, req: Request, res: Response): void {
  const code = safeDiagnosticErrorCode(error);
  logDiagnostic({
    event: "HTTP_SERVER_ERROR", outcome: "failed", requestId: res.locals.requestId ?? "unavailable",
    method: req.method, route: safeRouteTemplate(req), code
  });
}

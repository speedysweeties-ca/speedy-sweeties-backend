export const helpDestinations = {
  CUSTOMERS: "Customers", LIVE_ORDERS: "Live Orders", CREATE_MANUAL_ORDER: "Create Manual Order",
  DELIVERED_HISTORY: "Delivered History", DISPATCHER_CHECKLIST: "Daily Responsibilities",
  DRIVER_LOCATION: "Driver Location", DISPATCHER_PERFORMANCE: "Dispatcher Performance",
} as const;
export type HelpDestination = keyof typeof helpDestinations;
export type HelpTurn = { role: "user" | "assistant"; content: string };
export type HelpAnswer = {
  status: "ANSWERED" | "CLARIFY" | "NOT_DOCUMENTED";
  answer: string; steps: string[]; notes: string[];
  sources: Array<{ id: string; title: string; reviewedAt: string; destination: HelpDestination; content: string }>;
};

export function helpAnswerText(answer: HelpAnswer): string {
  return [answer.answer, ...answer.steps.map((step, index) => `${index + 1}. ${step}`), ...answer.notes].join("\n");
}

export function helpRequestBody(question: string, history: HelpTurn[]) {
  return { question: question.trim(), history: history.slice(-8).map(({ role, content }) => ({ role, content: content.slice(0, 6000) })) };
}

export function isHelpAnswer(value: unknown): value is HelpAnswer {
  if (!value || typeof value !== "object") return false;
  const a = value as Partial<HelpAnswer>;
  return ["ANSWERED", "CLARIFY", "NOT_DOCUMENTED"].includes(a.status ?? "") && typeof a.answer === "string" &&
    Array.isArray(a.steps) && a.steps.every((s) => typeof s === "string") &&
    Array.isArray(a.notes) && a.notes.every((s) => typeof s === "string") &&
    Array.isArray(a.sources) && a.sources.every((s) => s && typeof s.id === "string" && typeof s.title === "string" &&
      typeof s.content === "string" && typeof s.reviewedAt === "string" && Object.hasOwn(helpDestinations, s.destination));
}

import { useEffect, useRef, useState } from "react";
import { API_V1_BASE_URL } from "./apiConfig";
import { helpAnswerText, helpDestinations, helpRequestBody, isHelpAnswer, type HelpAnswer, type HelpDestination } from "./dispatcherHelpClient";

type Exchange = { question: string; response: HelpAnswer };
const suggestions = [
  "How do I change a customer's saved address?",
  "How do I assign an order to a driver?",
  "How do I create a telephone order?",
  "What are my daily responsibilities?",
];

export function DispatcherHelp({ token, onNavigate, onSessionExpired }: {
  token: string; onNavigate: (destination: HelpDestination) => void; onSessionExpired: () => void;
}) {
  const [question, setQuestion] = useState("");
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [pendingQuestion, setPendingQuestion] = useState("");
  const [error, setError] = useState("");
  const requestRef = useRef<AbortController | null>(null);
  const answerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => () => { requestRef.current?.abort(); }, []);
  useEffect(() => { if (exchanges.length) answerRef.current?.focus(); }, [exchanges.length]);

  async function ask(text: string) {
    const clean = text.trim();
    if (!clean || clean.length > 2000 || requestRef.current) return;
    const controller = new AbortController();
    requestRef.current = controller;
    setPendingQuestion(clean);
    setQuestion(clean);
    setError("");
    const timeout = window.setTimeout(() => controller.abort(), 35_000);
    try {
      const history = exchanges.flatMap(({ question: q, response }) => [
        { role: "user" as const, content: q }, { role: "assistant" as const, content: helpAnswerText(response) },
      ]);
      const result = await fetch(`${API_V1_BASE_URL}/dispatcher-help/ask`, {
        method: "POST", signal: controller.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(helpRequestBody(clean, history)),
      });
      if (result.status === 401) { onSessionExpired(); return; }
      const data: unknown = await result.json();
      if (!result.ok) {
        const message = data && typeof data === "object" && "message" in data && typeof data.message === "string"
          ? data.message : "The help guide is unavailable. Please try again.";
        throw new Error(message);
      }
      if (!isHelpAnswer(data)) throw new Error("The help guide returned an unreadable answer. Please try again.");
      setExchanges((previous) => [...previous, { question: clean, response: data }]);
      setQuestion("");
    } catch (cause) {
      setError(controller.signal.aborted ? "The request timed out. Your question is still here; you can try again."
        : cause instanceof Error ? cause.message : "Could not reach the help guide. Please try again.");
    } finally {
      window.clearTimeout(timeout);
      requestRef.current = null;
      setPendingQuestion("");
    }
  }

  return (
    <section aria-labelledby="dispatcher-help-title" className="max-w-4xl mx-auto space-y-5">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-red-300 text-sm font-semibold mb-2">YOUR DISPATCHER GUIDE</p>
            <h2 id="dispatcher-help-title" className="text-3xl font-bold">How do I…?</h2>
            <p className="text-zinc-300 mt-3 max-w-xl">Ask about the dispatch system or a business procedure. Get clear steps and the guide they came from.</p>
          </div>
          {exchanges.length > 0 && <button type="button" disabled={!!pendingQuestion}
            className="px-4 py-2 bg-zinc-800 rounded-lg hover:bg-zinc-700 disabled:opacity-50"
            onClick={() => { setExchanges([]); setQuestion(""); setError(""); inputRef.current?.focus(); }}>New conversation</button>}
        </div>
        <p className="text-zinc-400 text-sm mt-4">Answers use the dispatcher guide. If a policy isn’t documented, check with your manager. This guide explains tasks; you complete them in the relevant screen.</p>
        {exchanges.length === 0 && <div className="grid gap-3 sm:grid-cols-2 mt-6">
          {suggestions.map((suggestion) => <button key={suggestion} type="button" disabled={!!pendingQuestion}
            onClick={() => void ask(suggestion)} className="text-left p-4 rounded-xl bg-zinc-800 border border-zinc-700 hover:border-red-400 hover:bg-zinc-700 disabled:opacity-50 transition">
            {suggestion}<span aria-hidden="true" className="text-red-300 ml-2">→</span>
          </button>)}
        </div>}
      </div>

      <div role="log" aria-label="Help conversation" className="space-y-5">
        {exchanges.map(({ question: q, response }, index) => <div key={index} className="space-y-3">
          <div className="ml-auto max-w-[90%] rounded-2xl bg-zinc-800 px-5 py-4 whitespace-pre-wrap break-words">
            <p className="text-zinc-400 text-xs mb-1">You</p>{q}
          </div>
          <div ref={index === exchanges.length - 1 ? answerRef : undefined} tabIndex={-1}
            className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 focus:outline-none focus:ring-2 focus:ring-red-400">
            <p className="text-red-300 text-sm font-semibold mb-3">{response.status === "CLARIFY" ? "A quick clarification" : response.status === "NOT_DOCUMENTED" ? "Check with your manager" : "Dispatcher guide"}</p>
            <p className="whitespace-pre-wrap break-words leading-relaxed">{response.answer}</p>
            {response.steps.length > 0 && <ol className="list-decimal pl-6 space-y-3 mt-4 leading-relaxed">{response.steps.map((step, i) => <li key={i} className="pl-1 break-words">{step}</li>)}</ol>}
            {response.notes.length > 0 && <div className="mt-5 p-4 rounded-xl border border-amber-700/50 bg-amber-950/20 text-amber-100 space-y-2">{response.notes.map((note, i) => <p key={i}>{note}</p>)}</div>}
            {response.sources.length > 0 && <div className="mt-5 border-t border-zinc-800 pt-4 space-y-3">
              <p className="text-zinc-400 text-xs font-semibold uppercase tracking-wide">Source guides</p>
              {response.sources.map((source) => <div key={source.id} className="rounded-lg bg-zinc-950 p-3">
                <details><summary className="cursor-pointer text-zinc-200">{source.title}</summary>
                  <p className="text-zinc-400 text-xs mt-2">Reviewed {source.reviewedAt}</p>
                  <p className="text-zinc-300 text-sm leading-relaxed mt-2">{source.content}</p>
                </details>
                <button type="button" onClick={() => onNavigate(source.destination)} className="text-red-300 hover:text-red-200 text-sm underline underline-offset-4 mt-3">Open {helpDestinations[source.destination]} →</button>
              </div>)}
            </div>}
          </div>
        </div>)}
      </div>
      {pendingQuestion && <p role="status" className="text-zinc-300 px-2">Checking the dispatcher guide…</p>}
      <form onSubmit={(event) => { event.preventDefault(); void ask(question); }} className="bg-zinc-900 border border-zinc-700 rounded-2xl p-5">
        <label htmlFor="dispatcher-help-question" className="block font-semibold mb-3">{exchanges.length ? "Ask a follow-up question" : "What would you like help with?"}</label>
        <textarea id="dispatcher-help-question" ref={inputRef} value={question} maxLength={2000} disabled={!!pendingQuestion}
          onChange={(event) => setQuestion(event.target.value)} rows={3} aria-describedby="help-question-hint"
          placeholder="How do I change a customer’s address?"
          className="w-full p-3 rounded-xl bg-zinc-950 border border-zinc-700 focus:outline-none focus:border-red-400 resize-y disabled:opacity-60" />
        <div className="flex flex-wrap justify-between items-center gap-3 mt-3">
          <p id="help-question-hint" className="text-xs text-zinc-400">{question.length}/2,000 · Describe the task without private customer details.</p>
          <button type="submit" disabled={!!pendingQuestion || !question.trim()} className="rounded-lg bg-red-600 hover:bg-red-700 px-5 py-3 font-semibold disabled:opacity-50">{pendingQuestion ? "Finding your answer…" : error ? "Try again" : "Ask the guide"}</button>
        </div>
        {error && <p role="alert" className="mt-4 text-red-200">{error}</p>}
        <p className="text-xs text-zinc-500 mt-4">Conversation stays in this browser session and clears when you sign out or reload.</p>
      </form>
    </section>
  );
}

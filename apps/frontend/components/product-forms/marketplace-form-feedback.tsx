"use client";

import { createContext, useCallback, useContext, useId, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { useLanguage } from "../../app/use-labels";
import { Input } from "../ui/input";
import { describeMarketplaceError, marketplaceFieldKey, marketplaceFieldLabel, type MarketplaceFailure } from "./marketplace-errors.mjs";

const FieldFeedback = createContext<{ failure: MarketplaceFailure | null; clear: (field: string) => void }>({ failure: null, clear: () => {} });

export function useMarketplaceFeedback(contextKey: string) {
  const language = useLanguage();
  const [failures, setFailures] = useState<Record<string, MarketplaceFailure | null>>({});
  const report = useCallback((error: unknown, fallback = "", targetContext = contextKey) => {
    const failure = describeMarketplaceError(error, language, fallback);
    setFailures((current) => ({ ...current, [targetContext]: failure }));
    return failure.message;
  }, [contextKey, language]);
  const clear = useCallback((field: string) => {
    setFailures((current) => {
      const failure = current[contextKey];
      if (!failure) return current;
      const issues = failure.issues.filter((issue) => issue.field !== marketplaceFieldKey(field));
      return { ...current, [contextKey]: issues.length ? { ...failure, issues } : null };
    });
  }, [contextKey]);
  const reset = useCallback(() => setFailures({}), []);
  return { failure: failures[contextKey] ?? null, report, clear, reset };
}

export function MarketplaceFormFeedback({ failure, clear, children }: {
  failure: MarketplaceFailure | null; clear: (field: string) => void; children: ReactNode;
}) {
  const language = useLanguage();
  const container = useRef<HTMLDivElement>(null);
  return <FieldFeedback.Provider value={{ failure, clear }}>
    <div className="contents" ref={container}>
    {failure ? <section role="alert" className="mb-4 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
      <p className="font-semibold">{language === "ru" ? "Запрос не выполнен" : language === "de" ? "Anfrage fehlgeschlagen" : "Request failed"}</p>
      <ul className="mt-2 list-disc space-y-1 pl-5">{failure.issues.map((issue, index) => <li key={index}>
        {issue.field ? <button type="button" className="text-left underline underline-offset-2" onClick={() => {
          const field = container.current?.querySelector<HTMLElement>(`[data-marketplace-field="${CSS.escape(issue.field)}"]`)
            ?? (issue.field.startsWith("attributes.") ? container.current?.querySelector<HTMLElement>('[data-marketplace-field="attributes"]') : null);
          field?.scrollIntoView({ behavior: "smooth", block: "center" });
          field?.focus({ preventScroll: true });
        }}>{[issue.target, marketplaceFieldLabel(issue.field, language), issue.message].filter(Boolean).join(": ")}</button> : [issue.target, issue.message].filter(Boolean).join(": ")}
      </li>)}</ul>
      {failure.requestId ? <p className="mt-2 text-xs">Request ID: {failure.requestId}</p> : null}
    </section> : null}
    {children}
    </div>
  </FieldFeedback.Provider>;
}

export function useMarketplaceField(name?: string) {
  const { failure, clear } = useContext(FieldFeedback);
  const id = useId();
  const key = marketplaceFieldKey(name);
  const message = key ? failure?.issues.find((issue) => issue.field === key)?.message : undefined;
  return { message, key, errorId: `${id}-error`, clear: () => { if (key) clear(key); } };
}

export function MarketplaceInput({ onChange, ...props }: ComponentProps<typeof Input>) {
  const feedback = useMarketplaceField(props.name);
  return <><Input {...props}
    data-marketplace-field={feedback.key || undefined}
    aria-invalid={feedback.message ? true : props["aria-invalid"]}
    aria-describedby={feedback.message ? feedback.errorId : props["aria-describedby"]}
    onChange={(event) => { feedback.clear(); onChange?.(event); }} />
    {feedback.message ? <span id={feedback.errorId} className="text-xs text-destructive">{feedback.message}</span> : null}</>;
}

export function MarketplaceSelect({ onChange, ...props }: ComponentProps<"select">) {
  const feedback = useMarketplaceField(props.name);
  return <><select {...props}
    data-marketplace-field={feedback.key || undefined}
    aria-invalid={feedback.message ? true : props["aria-invalid"]}
    aria-describedby={feedback.message ? feedback.errorId : props["aria-describedby"]}
    className={[props.className, feedback.message ? "border-destructive ring-1 ring-destructive" : ""].filter(Boolean).join(" ")}
    onChange={(event) => { feedback.clear(); onChange?.(event); }} />
    {feedback.message ? <span id={feedback.errorId} className="text-xs text-destructive">{feedback.message}</span> : null}</>;
}

export function MarketplaceFieldGroup({ name, children, className }: { name: string; children: ReactNode; className?: string }) {
  const feedback = useMarketplaceField(name);
  return <div role="group" tabIndex={-1} data-marketplace-field={feedback.key} data-invalid={Boolean(feedback.message)} aria-describedby={feedback.message ? feedback.errorId : undefined}
    className={[className, feedback.message ? "rounded-lg border border-destructive p-2" : ""].filter(Boolean).join(" ")} onChangeCapture={feedback.clear}>
    {children}{feedback.message ? <p id={feedback.errorId} className="mt-1 text-xs text-destructive">{feedback.message}</p> : null}
  </div>;
}

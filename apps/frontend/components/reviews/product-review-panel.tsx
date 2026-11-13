"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useLanguage } from "../../app/use-labels";
import { createRequestId } from "../../lib/api/request-id";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { fetchReviewDraft, fetchReviews, retryReview, type ReviewDraft, type ReviewItem, type ReviewList } from "./product-review-api";
import { reviewLabels } from "./product-review-labels";
import { ProductReviewPayloadEditor } from "./product-review-payload-editor";

export function ProductReviewPanel() {
  const lang = useLanguage();
  const labels = reviewLabels[lang];
  const [data, setData] = useState<ReviewList>({ items: [], next_offset: null, status_unavailable: false });
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [problemsOnly, setProblemsOnly] = useState(true);
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState<ReviewDraft | null>(null);
  const [opening, setOpening] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const editorRequest = useRef<AbortController | null>(null);
  const retryKey = useRef<{ signature: string; key: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let inFlight = false;
    const load = async () => {
      if (inFlight) return;
      inFlight = true;
      setLoading(true);
      try {
        const result = await fetchReviews(offset, query, controller.signal);
        if (!controller.signal.aborted) { setData(result); setError(""); }
      } catch (caught) {
        if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Request failed");
      } finally {
        inFlight = false;
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 15000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [offset, query, version]);
  useEffect(() => () => editorRequest.current?.abort(), []);

  async function open(item: ReviewItem) {
    editorRequest.current?.abort();
    const controller = new AbortController();
    editorRequest.current = controller;
    setOpening(true);
    setDraft(null);
    setError("");
    setConfirming(false);
    try {
      const result = await fetchReviewDraft(item, controller.signal);
      if (!controller.signal.aborted) setDraft(result);
    } catch (caught) {
      if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Request failed");
    } finally {
      if (!controller.signal.aborted) setOpening(false);
    }
  }

  async function submit() {
    if (!draft || submitting || !draft.item.retryable) return;
    const signature = JSON.stringify([draft.item.job_id, draft.item.target, draft.payload]);
    if (retryKey.current?.signature !== signature) retryKey.current = { signature, key: createRequestId() };
    setSubmitting(true);
    setError("");
    try {
      await retryReview(draft, retryKey.current.key);
      setDraft(null);
      setConfirming(false);
      setNotice(labels.saved);
      setOffset(0);
      setVersion((current) => current + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Request failed");
    } finally {
      setSubmitting(false);
    }
  }

  const items = data.items.filter((item) => !problemsOnly || ["failed", "rejected", "unknown"].includes(item.state) || item.messages.length > 0);
  return <div className="space-y-4">
    <Card>
      <CardHeader><CardTitle>{labels.title}</CardTitle><CardDescription>{labels.hint}</CardDescription></CardHeader>
      <CardContent className="flex flex-wrap gap-3">
        <form className="flex min-w-0 flex-1 gap-2" onSubmit={(event) => { event.preventDefault(); setQuery(queryInput.trim()); setOffset(0); setVersion((current) => current + 1); }}>
          <Input aria-label={labels.search} placeholder={labels.search} value={queryInput} onChange={(event) => setQueryInput(event.target.value)} />
          <Button type="submit" variant="outline">{labels.search}</Button>
        </form>
        <select aria-label={labels.all} className="h-10 rounded-md border bg-background px-3 text-sm" value={problemsOnly ? "problems" : "all"} onChange={(event) => setProblemsOnly(event.target.value === "problems")}>
          <option value="problems">{labels.problems}</option><option value="all">{labels.all}</option>
        </select>
        <Button type="button" variant="outline" disabled={loading} onClick={() => setVersion((current) => current + 1)}>{labels.refresh}</Button>
      </CardContent>
    </Card>
    {error ? <p role="alert" className="rounded-lg border border-destructive p-3 text-sm text-destructive">{error}</p> : null}
    {notice ? <p role="status" className="text-sm">{notice}</p> : null}
    {data.status_unavailable ? <p role="alert" className="text-sm text-amber-700">{labels.unavailable}</p> : null}
    <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(280px,1fr)_minmax(0,2fr)]">
      <section aria-label={labels.problems} className="min-w-0 space-y-3" aria-busy={loading}>
        {items.length === 0 ? <p className="p-4 text-sm text-muted-foreground">{loading ? labels.loading : labels.empty}</p> : null}
        {items.map((item) => <Card key={`${item.job_id}:${item.target}`}>
          <CardHeader>
            <CardTitle className="break-words text-sm">{item.target.replaceAll(",", " · ")}</CardTitle>
            <CardDescription>KID: {item.kid_number || "—"} · EAN: {item.ean || "—"}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Badge variant={item.state === "online" ? "success" : ["failed", "rejected"].includes(item.state) ? "error" : "warning"}>{labels.states[item.state]}</Badge>
            <ul className="break-words text-sm text-destructive">{item.messages.map((message, index) => <li key={index}>{message}</li>)}</ul>
            {item.blocked_reason ? <p className="text-xs text-muted-foreground">{item.blocked_reason}</p> : null}
            <p className="text-xs text-muted-foreground">{new Date(item.created_at_unix_ms).toLocaleString(lang)} · Request ID: {item.request_id}</p>
            <div className="flex flex-wrap gap-3">
              <Button type="button" size="sm" disabled={submitting || opening} onClick={() => void open(item)}>{labels.edit}</Button>
              {item.kid_id ? <Link className="text-sm underline" href={`/sofort-list/${encodeURIComponent(item.kid_number)}?${new URLSearchParams({ kidId: String(item.kid_id) })}`}>Sofort list</Link> : null}
            </div>
          </CardContent>
        </Card>)}
        <div className="flex justify-between gap-2">
          <Button type="button" variant="outline" disabled={offset === 0 || loading} onClick={() => setOffset(Math.max(0, offset - 50))}>{labels.back}</Button>
          <Button type="button" variant="outline" disabled={data.next_offset === null || loading} onClick={() => { if (data.next_offset !== null) setOffset(data.next_offset); }}>{labels.next}</Button>
        </div>
      </section>
      {opening ? <p role="status">{labels.loading}</p> : draft ? <Card className="min-w-0">
        <CardHeader>
          <CardTitle>{draft.item.target} · {draft.item.ean}</CardTitle>
          <CardDescription>{labels.caution}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {draft.item.blocked_reason ? <p role="alert">{draft.item.blocked_reason}</p> : null}
          <fieldset disabled={submitting} className="min-w-0">
            <ProductReviewPayloadEditor draft={draft} labels={labels} onChange={(payload) => { setDraft({ ...draft, payload }); setConfirming(false); }} />
          </fieldset>
          {confirming ? <div className="space-y-2 rounded-lg border p-3" role="group" aria-label={labels.confirmation}>
            <p className="text-sm">{labels.confirmation}</p>
            <Button type="button" disabled={submitting} onClick={() => void submit()}>{submitting ? labels.sending : labels.confirm}</Button>
          </div> : <Button type="button" disabled={!draft.item.retryable || submitting} onClick={() => setConfirming(true)}>{labels.send}</Button>}
          <Button type="button" variant="outline" disabled={submitting} onClick={() => { setDraft(null); setConfirming(false); }}>{labels.close}</Button>
        </CardContent>
      </Card> : null}
    </div>
  </div>;
}

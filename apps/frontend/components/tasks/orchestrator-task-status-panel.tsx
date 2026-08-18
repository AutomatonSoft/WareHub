"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, CircleDotDashed, LoaderCircle, RefreshCw, Search } from "lucide-react";

import { useLabels } from "../../app/use-labels";
import { apiFetch } from "../../lib/api/client";
import { Button } from "../ui/button";

const PAGE_SIZE = 20;

type TaskTarget = { marketplace?: string; target?: string; status?: string; error?: { message?: string } };
type Task = { job_id: string; request_id: string; ean: string; operation: string; status: string; created_at_unix_ms: number; updated_at_unix_ms: number; result?: { results?: TaskTarget[] }; error?: { message?: string } };
type ProductEditorTask = { job_id: string; request_id: string; active_group?: string; ean?: string; status: string; targets?: Array<{ target_id?: string; status?: string; error?: { message?: string } }>; error?: { message?: string }; created_at_unix_ms?: number; updated_at_unix_ms?: number };
type MarketplaceToggleTask = { job_id: string; request_id: string; kid_number: string; inactive: boolean; status: string; results?: Array<{ site_key?: string; channel?: string; ok?: boolean; status_code?: number }>; error?: { message?: string }; created_at_unix_ms?: number; updated_at_unix_ms?: number };
type JvBatchTask = { id: number; ean: string; operation: string; status: string; created_at?: string; updated_at?: string; items?: Array<{ site?: string; site_key?: string; status?: string; error_text?: string }> };
type JobsResponse<T> = { jobs?: T[]; total?: number };
type SourceKey = "orchestrator" | "productEditor" | "marketplace" | "jvBatch";
type SourceState = { tasks: Task[]; total: number };
type SourceStates = Record<SourceKey, SourceState>;
type SourceOffsets = Record<SourceKey, number>;
type SourceLoading = Record<SourceKey, boolean>;
type SourceErrors = Record<SourceKey, string>;

const emptyStates: SourceStates = {
  orchestrator: { tasks: [], total: 0 },
  productEditor: { tasks: [], total: 0 },
  marketplace: { tasks: [], total: 0 },
  jvBatch: { tasks: [], total: 0 },
};
const emptyOffsets: SourceOffsets = { orchestrator: 0, productEditor: 0, marketplace: 0, jvBatch: 0 };
const initialSourceLoading: SourceLoading = { orchestrator: true, productEditor: true, marketplace: true, jvBatch: true };
const emptySourceErrors: SourceErrors = { orchestrator: "", productEditor: "", marketplace: "", jvBatch: "" };

function statusClass(status: string): string {
  if (["completed", "ok", "success", "applied"].includes(status)) return "bg-emerald-100 text-emerald-800";
  if (["failed", "error"].includes(status)) return "bg-red-100 text-red-800";
  if (["running", "queued", "pending"].includes(status)) return "bg-amber-100 text-amber-800";
  return "bg-slate-100 text-slate-700";
}

function isActive(status: string): boolean {
  return ["queued", "running", "pending"].includes(status);
}

function formatTime(value: number): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "medium" }).format(new Date(value));
}

function buildQuery(offset: number, query: string): string {
  const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
  if (query.trim()) params.set("query", query.trim());
  return params.toString();
}

function toProductEditorTask(job: ProductEditorTask): Task {
  return { job_id: job.job_id, request_id: job.request_id, ean: job.ean ?? "-", operation: `product_editor_${job.active_group?.toLowerCase() ?? "apply"}`, status: job.status, created_at_unix_ms: job.created_at_unix_ms ?? 0, updated_at_unix_ms: job.updated_at_unix_ms ?? 0, result: { results: (job.targets ?? []).map((target) => ({ marketplace: job.active_group, target: target.target_id, status: target.status, error: target.error })) }, error: job.error };
}

function toMarketplaceTask(job: MarketplaceToggleTask): Task {
  return { job_id: job.job_id, request_id: job.request_id, ean: `KID ${job.kid_number}`, operation: job.inactive ? "marketplace_deactivate" : "marketplace_activate", status: job.status === "ok" ? "completed" : job.status, created_at_unix_ms: job.created_at_unix_ms ?? 0, updated_at_unix_ms: job.updated_at_unix_ms ?? 0, result: { results: (job.results ?? []).map((result) => ({ marketplace: result.channel, target: result.site_key, status: result.ok ? "success" : "failed", error: result.ok ? undefined : { message: `HTTP ${result.status_code ?? "-"}` } })) }, error: job.error };
}

function toJvBatchTask(job: JvBatchTask): Task {
  return { job_id: `jv-batch-${job.id}`, request_id: "", ean: job.ean, operation: `jv_${job.operation}`, status: job.status === "applied" ? "completed" : job.status, created_at_unix_ms: job.created_at ? Date.parse(job.created_at) : 0, updated_at_unix_ms: job.updated_at ? Date.parse(job.updated_at) : 0, result: { results: (job.items ?? []).map((item) => ({ marketplace: item.site, target: item.site_key, status: item.status, error: item.error_text ? { message: item.error_text } : undefined })) } };
}

export function OrchestratorTaskStatusPanel() {
  const t = useLabels();
  const [sourceStates, setSourceStates] = useState<SourceStates>(emptyStates);
  const [offsets, setOffsets] = useState<SourceOffsets>(emptyOffsets);
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [sourceLoading, setSourceLoading] = useState<SourceLoading>(initialSourceLoading);
  const [sourceErrors, setSourceErrors] = useState<SourceErrors>(emptySourceErrors);
  const [refreshing, setRefreshing] = useState(false);

  const loadTasks = useCallback(async () => {
    setRefreshing(true);
    const loadSource = async <T,>(
      source: SourceKey,
      url: string,
      toTasks: (payload: JobsResponse<T>) => Task[],
    ) => {
      setSourceLoading((current) => ({ ...current, [source]: true }));
      try {
        const response = await apiFetch(url);
        const payload = await response.json() as JobsResponse<T>;
        if (!response.ok) {
          throw new Error("task_status_request_failed");
        }
        setSourceStates((current) => ({
          ...current,
          [source]: {
            tasks: toTasks(payload),
            total: payload.total ?? 0,
          },
        }));
        setSourceErrors((current) => ({ ...current, [source]: "" }));
      } catch {
        setSourceErrors((current) => ({ ...current, [source]: t.taskStatusesError }));
      } finally {
        setSourceLoading((current) => ({ ...current, [source]: false }));
      }
    };

    await Promise.all([
      loadSource<Task>(
        "orchestrator",
        `/api/v1/orchestrator/jobs?${buildQuery(offsets.orchestrator, query)}`,
        (payload) => Array.isArray(payload.jobs) ? payload.jobs : [],
      ),
      loadSource<ProductEditorTask>(
        "productEditor",
        `/api/v1/orchestrator/product-editor/jobs?${buildQuery(offsets.productEditor, query)}`,
        (payload) => (payload.jobs ?? []).map(toProductEditorTask),
      ),
      loadSource<MarketplaceToggleTask>(
        "marketplace",
        `/api/v1/orchestrator/marketplace/jobs?${buildQuery(offsets.marketplace, query)}`,
        (payload) => (payload.jobs ?? []).map(toMarketplaceTask),
      ),
      loadSource<JvBatchTask>(
        "jvBatch",
        `/api/v1/jv/batch/jobs/?${buildQuery(offsets.jvBatch, query)}`,
        (payload) => (payload.jobs ?? []).map(toJvBatchTask),
      ),
    ]);
    setRefreshing(false);
  }, [offsets, query, t.taskStatusesError]);

  useEffect(() => {
    void loadTasks();
    const intervalId = window.setInterval(() => void loadTasks(), 5000);
    return () => window.clearInterval(intervalId);
  }, [loadTasks]);

  const activeTaskCount = useMemo(() => Object.values(sourceStates).flatMap(({ tasks }) => tasks).filter((task) => isActive(task.status)).length, [sourceStates]);
  const applySearch = () => { setOffsets(emptyOffsets); setQuery(searchInput); };

  return (
    <section className="w-full space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{t.taskStatusesTitle}</h1>
          <p className="text-sm text-muted-foreground">{t.taskStatusesSubtitle}</p>
          <p className="mt-2 inline-flex items-center gap-2 text-xs text-muted-foreground">
            <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" /></span>
            {refreshing ? <LoaderCircle size={14} className="animate-spin" /> : <CircleDotDashed size={14} />}
            {t.taskStatusesLive} · {activeTaskCount} {t.taskStatusesActive}
          </p>
        </div>
        <Button type="button" variant="secondary" onClick={() => void loadTasks()} disabled={refreshing}><RefreshCw size={16} className={`mr-2 ${refreshing ? "animate-spin" : ""}`} />{t.taskStatusesRefresh}</Button>
      </div>

      <form className="flex flex-wrap gap-2 rounded-xl border bg-card p-3" onSubmit={(event) => { event.preventDefault(); applySearch(); }}>
        <label className="sr-only" htmlFor="task-status-search">{t.taskStatusesSearch}</label>
        <input id="task-status-search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder={t.taskStatusesSearchPlaceholder} className="h-10 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm" />
        <Button type="submit"><Search size={16} className="mr-2" />{t.taskStatusesSearch}</Button>
      </form>

      <div className="grid gap-4">
        <TaskSection title={t.taskStatusesOrchestrator} state={sourceStates.orchestrator} loading={sourceLoading.orchestrator} error={sourceErrors.orchestrator} offset={offsets.orchestrator} onPage={(offset) => setOffsets((current) => ({ ...current, orchestrator: offset }))} labels={t} />
        <TaskSection title={t.taskStatusesProductEditor} state={sourceStates.productEditor} loading={sourceLoading.productEditor} error={sourceErrors.productEditor} offset={offsets.productEditor} onPage={(offset) => setOffsets((current) => ({ ...current, productEditor: offset }))} labels={t} />
        <TaskSection title={t.taskStatusesMarketplace} state={sourceStates.marketplace} loading={sourceLoading.marketplace} error={sourceErrors.marketplace} offset={offsets.marketplace} onPage={(offset) => setOffsets((current) => ({ ...current, marketplace: offset }))} labels={t} />
        <TaskSection title={t.taskStatusesJvBatch} state={sourceStates.jvBatch} loading={sourceLoading.jvBatch} error={sourceErrors.jvBatch} offset={offsets.jvBatch} onPage={(offset) => setOffsets((current) => ({ ...current, jvBatch: offset }))} labels={t} />
      </div>
    </section>
  );
}

function TaskSection({ title, state, loading, error, offset, onPage, labels }: { title: string; state: SourceState; loading: boolean; error: string; offset: number; onPage: (offset: number) => void; labels: ReturnType<typeof useLabels> }) {
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const hasPrevious = offset > 0;
  const hasNext = offset + PAGE_SIZE < state.total;
  return <section className="rounded-xl border bg-card p-4 shadow-sm"><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><h2 className="inline-flex items-center gap-2 font-semibold text-foreground">{title}{loading ? <LoaderCircle size={15} className="animate-spin text-primary" aria-label={labels.taskStatusesLoading} /> : null}</h2><p className="text-xs text-muted-foreground">{labels.taskStatusesFound}: {state.total}</p></div><div className="flex items-center gap-1"><Button type="button" variant="ghost" size="icon" onClick={() => onPage(Math.max(0, offset - PAGE_SIZE))} disabled={!hasPrevious || loading} aria-label={labels.taskStatusesPrevious}><ChevronLeft size={16} /></Button><span className="min-w-16 text-center text-xs text-muted-foreground">{labels.taskStatusesPage} {page}</span><Button type="button" variant="ghost" size="icon" onClick={() => onPage(offset + PAGE_SIZE)} disabled={!hasNext || loading} aria-label={labels.taskStatusesNext}><ChevronRight size={16} /></Button></div></div>{loading && state.tasks.length === 0 ? <p className="inline-flex items-center gap-2 rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground"><LoaderCircle size={16} className="animate-spin" />{labels.taskStatusesLoading}</p> : error ? <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : state.tasks.length === 0 ? <p className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">{labels.taskStatusesEmpty}</p> : <div className="grid gap-3">{state.tasks.map((task) => <TaskCard key={task.job_id} task={task} labels={labels} />)}</div>}</section>;
}

function TaskCard({ task, labels }: { task: Task; labels: ReturnType<typeof useLabels> }) {
  const targets = task.result?.results ?? [];
  return <article className="rounded-lg border bg-background p-3"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="font-medium text-foreground">{task.operation} · {task.ean.startsWith("KID ") ? task.ean : `EAN ${task.ean}`}</p><p className="break-all text-xs text-muted-foreground">{task.job_id}</p>{task.updated_at_unix_ms > 0 ? <p className="text-xs text-muted-foreground">{formatTime(task.updated_at_unix_ms)}</p> : null}</div><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(task.status)}`}>{task.status}</span></div>{targets.length > 0 ? <div className="mt-3 space-y-1 text-sm"><p className="font-medium text-foreground">{labels.taskStatusesTargets}</p>{targets.map((target, index) => <p key={`${task.job_id}-${target.target ?? index}`} className="text-muted-foreground">{target.marketplace ?? "-"} / {target.target ?? "-"}: {target.status ?? "-"}{target.error?.message ? ` — ${target.error.message}` : ""}</p>)}</div> : null}{task.error?.message ? <p className="mt-3 text-sm text-red-700">{task.error.message}</p> : null}</article>;
}

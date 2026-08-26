"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleDotDashed,
  Clock3,
  LoaderCircle,
  RefreshCw,
  Search,
} from "lucide-react";

import { useLabels } from "../../app/use-labels";
import { apiFetch } from "../../lib/api/client";
import { Button } from "../ui/button";

const PAGE_SIZE = 20;

type TaskTarget = { marketplace?: string; target?: string; status?: string; error?: { message?: string } };
type Task = { job_id: string; request_id: string; ean: string; operation: string; status: string; created_at_unix_ms: number; updated_at_unix_ms: number; result?: { results?: TaskTarget[] }; error?: { message?: string } };
type ProductEditorTask = { job_id: string; request_id: string; active_group?: string; ean?: string; status: string; targets?: Array<{ target_id?: string; status?: string; error?: { message?: string } }>; error?: { message?: string }; created_at_unix_ms?: number; updated_at_unix_ms?: number };
type MarketplaceToggleTask = { job_id: string; request_id: string; kid_number: string; inactive: boolean; job_status?: string; status: string; results?: Array<{ site_key?: string; channel?: string; ok?: boolean; status_code?: number }>; error?: { message?: string }; created_at_unix_ms?: number; updated_at_unix_ms?: number };
type JvBatchTask = { id: number; ean: string; operation: string; status: string; created_at?: string; updated_at?: string; items?: Array<{ site?: string; site_key?: string; status?: string; error_text?: string }> };
type JobsResponse<T> = { jobs?: T[]; total?: number };
type SourceKey = "orchestrator" | "productEditor" | "marketplace" | "jvBatch";
type SourceState = { tasks: Task[]; total: number };
type SourceStates = Record<SourceKey, SourceState>;
type SourceOffsets = Record<SourceKey, number>;
type SourceLoading = Record<SourceKey, boolean>;
type SourceErrors = Record<SourceKey, string>;
type TaskWithSource = Task & { source: SourceKey };
type StatusFilter = "all" | "queued" | "running" | "completed" | "failed";

const sourceKeys: SourceKey[] = ["orchestrator", "productEditor", "marketplace", "jvBatch"];
const emptyStates: SourceStates = {
  orchestrator: { tasks: [], total: 0 },
  productEditor: { tasks: [], total: 0 },
  marketplace: { tasks: [], total: 0 },
  jvBatch: { tasks: [], total: 0 },
};
const emptyOffsets: SourceOffsets = { orchestrator: 0, productEditor: 0, marketplace: 0, jvBatch: 0 };
const initialSourceLoading: SourceLoading = { orchestrator: true, productEditor: true, marketplace: true, jvBatch: true };
const emptySourceErrors: SourceErrors = { orchestrator: "", productEditor: "", marketplace: "", jvBatch: "" };

function isActive(status: string): boolean {
  return ["queued", "running", "pending"].includes(status.toLowerCase());
}

function isCompleted(status: string): boolean {
  return ["completed", "ok", "success", "applied"].includes(status.toLowerCase());
}

function isFailed(status: string): boolean {
  return ["failed", "error"].includes(status.toLowerCase());
}

function formatTime(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "—";
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
  return { job_id: job.job_id, request_id: job.request_id, ean: `KID ${job.kid_number}`, operation: job.inactive ? "marketplace_deactivate" : "marketplace_activate", status: job.job_status === "completed" ? "completed" : job.status === "ok" ? "completed" : job.status, created_at_unix_ms: job.created_at_unix_ms ?? 0, updated_at_unix_ms: job.updated_at_unix_ms ?? 0, result: { results: (job.results ?? []).map((result) => ({ marketplace: result.channel, target: result.site_key, status: result.ok ? "success" : "failed", error: result.ok ? undefined : { message: `HTTP ${result.status_code ?? "-"}` } })) }, error: job.error };
}

function toJvBatchTask(job: JvBatchTask): Task {
  return { job_id: `jv-batch-${job.id}`, request_id: "", ean: job.ean, operation: `jv_${job.operation}`, status: job.status === "applied" ? "completed" : job.status, created_at_unix_ms: job.created_at ? Date.parse(job.created_at) : 0, updated_at_unix_ms: job.updated_at ? Date.parse(job.updated_at) : 0, result: { results: (job.items ?? []).map((item) => ({ marketplace: item.site, target: item.site_key, status: item.status, error: item.error_text ? { message: item.error_text } : undefined })) } };
}

function sourceLabel(source: SourceKey, labels: ReturnType<typeof useLabels>): string {
  const sourceLabels: Record<SourceKey, string> = {
    orchestrator: labels.taskStatusesOrchestrator,
    productEditor: labels.taskStatusesProductEditor,
    marketplace: labels.taskStatusesMarketplace,
    jvBatch: labels.taskStatusesJvBatch,
  };
  return sourceLabels[source];
}

function statusView(status: string, labels: ReturnType<typeof useLabels>) {
  if (isCompleted(status)) return { label: labels.taskStatusesCompleted, badgeClass: "bg-emerald-50 text-emerald-700", lineClass: "bg-emerald-500", icon: Check };
  if (isFailed(status)) return { label: labels.taskStatusesFailed, badgeClass: "bg-red-50 text-red-700", lineClass: "bg-red-500", icon: CircleAlert };
  if (status.toLowerCase() === "queued" || status.toLowerCase() === "pending") return { label: labels.taskStatusesInQueue, badgeClass: "bg-blue-50 text-blue-700", lineClass: "bg-blue-500", icon: Clock3 };
  return { label: labels.taskStatusesInProgress, badgeClass: "bg-amber-50 text-amber-700", lineClass: "bg-amber-500", icon: LoaderCircle };
}

function matchesStatusFilter(task: Task, filter: StatusFilter): boolean {
  if (filter === "all") return true;
  if (filter === "queued") return ["queued", "pending"].includes(task.status.toLowerCase());
  if (filter === "running") return task.status.toLowerCase() === "running";
  if (filter === "completed") return isCompleted(task.status);
  return isFailed(task.status);
}

export function OrchestratorTaskStatusPanel() {
  const t = useLabels();
  const [sourceStates, setSourceStates] = useState<SourceStates>(emptyStates);
  const [offsets, setOffsets] = useState<SourceOffsets>(emptyOffsets);
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"all" | SourceKey>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sourceLoading, setSourceLoading] = useState<SourceLoading>(initialSourceLoading);
  const [sourceErrors, setSourceErrors] = useState<SourceErrors>(emptySourceErrors);
  const [refreshing, setRefreshing] = useState(false);

  const loadTasks = useCallback(async () => {
    setRefreshing(true);
    const loadSource = async <T,>(source: SourceKey, url: string, toTasks: (payload: JobsResponse<T>) => Task[]) => {
      setSourceLoading((current) => ({ ...current, [source]: true }));
      try {
        const response = await apiFetch(url);
        const payload = await response.json() as JobsResponse<T>;
        if (!response.ok) throw new Error("task_status_request_failed");
        setSourceStates((current) => ({ ...current, [source]: { tasks: toTasks(payload), total: payload.total ?? 0 } }));
        setSourceErrors((current) => ({ ...current, [source]: "" }));
      } catch {
        setSourceErrors((current) => ({ ...current, [source]: t.taskStatusesError }));
      } finally {
        setSourceLoading((current) => ({ ...current, [source]: false }));
      }
    };

    await Promise.all([
      loadSource<Task>("orchestrator", `/api/v1/orchestrator/jobs?${buildQuery(offsets.orchestrator, query)}`, (payload) => Array.isArray(payload.jobs) ? payload.jobs : []),
      loadSource<ProductEditorTask>("productEditor", `/api/v1/orchestrator/product-editor/jobs?${buildQuery(offsets.productEditor, query)}`, (payload) => (payload.jobs ?? []).map(toProductEditorTask)),
      loadSource<MarketplaceToggleTask>("marketplace", `/api/v1/orchestrator/marketplace/jobs?${buildQuery(offsets.marketplace, query)}`, (payload) => (payload.jobs ?? []).map(toMarketplaceTask)),
      loadSource<JvBatchTask>("jvBatch", `/api/v1/jv/batch/jobs/?${buildQuery(offsets.jvBatch, query)}`, (payload) => (payload.jobs ?? []).map(toJvBatchTask)),
    ]);
    setRefreshing(false);
  }, [offsets, query, t.taskStatusesError]);

  useEffect(() => {
    void loadTasks();
    const intervalId = window.setInterval(() => void loadTasks(), 5000);
    return () => window.clearInterval(intervalId);
  }, [loadTasks]);

  const allTasks = useMemo<TaskWithSource[]>(() => sourceKeys
    .flatMap((source) => sourceStates[source].tasks.map((task) => ({ ...task, source })))
    .sort((left, right) => (right.updated_at_unix_ms || right.created_at_unix_ms) - (left.updated_at_unix_ms || left.created_at_unix_ms)), [sourceStates]);
  const filteredTasks = useMemo(() => allTasks.filter((task) => (sourceFilter === "all" || task.source === sourceFilter) && matchesStatusFilter(task, statusFilter)), [allTasks, sourceFilter, statusFilter]);
  const queueTasks = useMemo(() => filteredTasks.filter((task) => isActive(task.status)), [filteredTasks]);
  const completedTasks = useMemo(() => filteredTasks.filter((task) => !isActive(task.status)), [filteredTasks]);
  const sourceCount = sourceKeys.reduce((total, source) => total + sourceStates[source].total, 0);
  const applySearch = () => { setOffsets(emptyOffsets); setQuery(searchInput); };

  return (
    <section className="w-full space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t.taskStatusesTitle}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t.taskStatusesSubtitle}</p>
          <p className="mt-2 inline-flex items-center gap-2 text-xs text-muted-foreground">
            <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75 motion-reduce:hidden" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" /></span>
            {refreshing ? <LoaderCircle size={14} className="animate-spin" /> : <CircleDotDashed size={14} />}
            {t.taskStatusesLive} · {queueTasks.length} {t.taskStatusesActive}
          </p>
        </div>
        <Button type="button" variant="secondary" onClick={() => void loadTasks()} disabled={refreshing}><RefreshCw size={16} className={`mr-2 ${refreshing ? "animate-spin" : ""}`} />{t.taskStatusesRefresh}</Button>
      </header>

      <form className="grid gap-2 rounded-xl border bg-card p-3 shadow-sm md:grid-cols-[minmax(150px,0.25fr)_minmax(150px,0.25fr)_minmax(0,1fr)_auto]" onSubmit={(event) => { event.preventDefault(); applySearch(); }}>
        <label className="sr-only" htmlFor="task-source-filter">{t.taskStatusesAllTypes}</label>
        <select id="task-source-filter" value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value as "all" | SourceKey)} className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus:border-primary">
          <option value="all">{t.taskStatusesAllTypes}</option>
          {sourceKeys.map((source) => <option key={source} value={source}>{sourceLabel(source, t)}</option>)}
        </select>
        <label className="sr-only" htmlFor="task-status-filter">{t.status}</label>
        <select id="task-status-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)} className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus:border-primary">
          <option value="all">{t.status}</option>
          <option value="queued">{t.taskStatusesInQueue}</option>
          <option value="running">{t.taskStatusesInProgress}</option>
          <option value="completed">{t.taskStatusesCompleted}</option>
          <option value="failed">{t.taskStatusesFailed}</option>
        </select>
        <label className="sr-only" htmlFor="task-status-search">{t.taskStatusesSearch}</label>
        <input id="task-status-search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder={t.taskStatusesSearchPlaceholder} className="h-10 min-w-0 rounded-md border bg-background px-3 text-sm outline-none focus:border-primary" />
        <Button type="submit"><Search size={16} className="mr-2" />{t.taskStatusesSearch}</Button>
      </form>

      <TaskArea title={t.taskStatusesCurrentQueue} count={queueTasks.length} loading={refreshing && queueTasks.length === 0} emptyLabel={t.taskStatusesEmpty}>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{queueTasks.map((task) => <QueueTaskCard key={`${task.source}-${task.job_id}`} task={task} labels={t} />)}</div>
      </TaskArea>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)]">
        <TaskArea title={t.taskStatusesHistory} count={completedTasks.length} emptyLabel={t.taskStatusesEmpty}>
          <div className="divide-y rounded-lg border bg-background">{completedTasks.slice(0, 5).map((task) => <HistoryTaskRow key={`${task.source}-${task.job_id}`} task={task} labels={t} />)}</div>
        </TaskArea>
        <TaskArea title={t.taskStatusesRecentResults} count={sourceCount} emptyLabel={t.taskStatusesEmpty}>
          <TaskArchive tasks={completedTasks.slice(0, 8)} labels={t} />
          <div className="mt-4 grid gap-2 sm:grid-cols-2">{sourceKeys.map((source) => <SourcePager key={source} source={source} state={sourceStates[source]} loading={sourceLoading[source]} offset={offsets[source]} onPage={(offset) => setOffsets((current) => ({ ...current, [source]: offset }))} labels={t} />)}</div>
          {sourceKeys.some((source) => sourceErrors[source]) ? <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{t.taskStatusesError}</p> : null}
        </TaskArea>
      </div>
    </section>
  );
}

function TaskArea({ title, count, loading = false, emptyLabel, children }: { title: string; count: number; loading?: boolean; emptyLabel: string; children: React.ReactNode }) {
  return <section className="rounded-xl border bg-card p-4 shadow-sm"><div className="mb-4 flex items-center gap-2"><h2 className="font-semibold text-foreground">{title}</h2><span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">{count}</span>{loading ? <LoaderCircle size={15} className="animate-spin text-primary" /> : null}</div>{count === 0 ? <p className="rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">{emptyLabel}</p> : children}</section>;
}

function QueueTaskCard({ task, labels }: { task: TaskWithSource; labels: ReturnType<typeof useLabels> }) {
  const view = statusView(task.status, labels);
  const StatusIcon = view.icon;
  const targetCount = task.result?.results?.length ?? 0;
  return <article className="rounded-xl border bg-background p-4 shadow-sm transition-shadow duration-200 hover:shadow-md"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-foreground">{task.operation} · {task.ean.startsWith("KID ") ? task.ean : `EAN ${task.ean}`}</p><p className="mt-1 truncate text-xs text-muted-foreground">{sourceLabel(task.source, labels)}</p></div><span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${view.badgeClass}`}><StatusIcon size={13} className={task.status.toLowerCase() === "running" ? "animate-spin" : ""} />{view.label}</span></div><div className="mt-4 flex items-end justify-between gap-3 text-xs text-muted-foreground"><span>{labels.taskStatusesCreatedAt}: {formatTime(task.created_at_unix_ms)}</span><span>{targetCount > 0 ? `${targetCount} ${labels.taskStatusesTargets.toLowerCase()}` : task.request_id || "—"}</span></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"><div className={`h-full w-2/3 rounded-full ${view.lineClass} ${task.status.toLowerCase() === "running" ? "animate-pulse motion-reduce:animate-none" : ""}`} /></div></article>;
}

function HistoryTaskRow({ task, labels }: { task: TaskWithSource; labels: ReturnType<typeof useLabels> }) {
  const view = statusView(task.status, labels);
  const StatusIcon = view.icon;
  return <article className="flex items-center gap-3 px-3 py-3"><span className={`grid size-8 shrink-0 place-items-center rounded-full ${view.badgeClass}`}><StatusIcon size={15} /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-foreground">{task.operation} · {task.ean}</p><p className="truncate text-xs text-muted-foreground">{sourceLabel(task.source, labels)} · {formatTime(task.updated_at_unix_ms || task.created_at_unix_ms)}</p></div><span className={`hidden rounded-full px-2 py-1 text-xs font-medium sm:inline ${view.badgeClass}`}>{view.label}</span></article>;
}

function TaskArchive({ tasks, labels }: { tasks: TaskWithSource[]; labels: ReturnType<typeof useLabels> }) {
  if (tasks.length === 0) return <p className="rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">{labels.taskStatusesEmpty}</p>;
  return <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-3 py-2.5 font-medium">{labels.taskStatusesTargets}</th><th className="px-3 py-2.5 font-medium">EAN / KID</th><th className="px-3 py-2.5 font-medium">{labels.taskStatusesCreatedAt}</th><th className="px-3 py-2.5 font-medium">{labels.status}</th></tr></thead><tbody className="divide-y">{tasks.map((task) => { const view = statusView(task.status, labels); return <tr key={`${task.source}-${task.job_id}`} className="bg-background"><td className="px-3 py-3"><p className="font-medium text-foreground">{task.operation}</p><p className="text-xs text-muted-foreground">{sourceLabel(task.source, labels)}</p></td><td className="px-3 py-3 text-foreground">{task.ean}</td><td className="px-3 py-3 text-muted-foreground">{formatTime(task.updated_at_unix_ms || task.created_at_unix_ms)}</td><td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-xs font-medium ${view.badgeClass}`}>{view.label}</span></td></tr>; })}</tbody></table></div>;
}

function SourcePager({ source, state, loading, offset, onPage, labels }: { source: SourceKey; state: SourceState; loading: boolean; offset: number; onPage: (offset: number) => void; labels: ReturnType<typeof useLabels> }) {
  const hasPrevious = offset > 0;
  const hasNext = offset + PAGE_SIZE < state.total;
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  return <div className="flex items-center justify-between gap-2 rounded-lg border bg-background px-2 py-1.5"><span className="truncate text-xs text-muted-foreground">{sourceLabel(source, labels)} · {state.total}</span><div className="flex items-center gap-1"><Button type="button" variant="ghost" size="icon" onClick={() => onPage(Math.max(0, offset - PAGE_SIZE))} disabled={!hasPrevious || loading} aria-label={labels.taskStatusesPrevious}><ChevronLeft size={15} /></Button><span className="text-xs text-muted-foreground">{labels.taskStatusesPage} {page}</span><Button type="button" variant="ghost" size="icon" onClick={() => onPage(offset + PAGE_SIZE)} disabled={!hasNext || loading} aria-label={labels.taskStatusesNext}><ChevronRight size={15} /></Button></div></div>;
}

"use client";

import { useEffect, useState } from "react";
import type { Lang } from "../../i18n";
import { Button } from "../../../components/ui/button";
import { SectionCard } from "../../../components/ui/section-card";
import { requestAftercoolMapping, type MappingState } from "./aftercool-mapping-api";

const copy = {
  ru: {
    title: "Синхронизация EAN из Aftercool", subtitle: "JV → XL: сопоставление по полному совпадению GalleryURL.",
    start: "Запустить / продолжить", refresh: "Обновить статус", loading: "Загрузка…",
    confirm: "Загрузить все JV, затем XL и сохранить сопоставления в отдельной MongoDB? Публикации и таблица EAN WareHub не изменяются.",
    missing: "На сервере не настроены:", queued: "В очереди. Требуется запущенный Aftercool mapping worker.",
    rule: "JV сохраняется всегда. XL добавляется только при единственном совпадении и наличии EAN; иначе XL остаётся пустым. Повторный запуск продолжает сохранённый проход, а не обновляет весь каталог.",
    idle: "Не запущено", running: "Выполняется", completed: "Завершено", failed: "Ошибка — можно продолжить",
    jv: "Загружено JV", xl: "Загружено XL", mapped: "Обработано JV", recovering: "Worker прервался; ожидается восстановление.",
    storage: "Подготовка MongoDB", login: "Вход в Aftercool",
    jv_cache: "Загрузка JV", xl_cache: "Загрузка XL", jv_mapping: "Сопоставление JV → XL", error: "Не удалось получить статус"
  },
  en: {
    title: "Aftercool EAN synchronization", subtitle: "JV → XL: exact GalleryURL matching.",
    start: "Start / resume", refresh: "Refresh status", loading: "Loading…",
    confirm: "Load all JV, then XL and save mappings in the dedicated MongoDB? Listings and WareHub EAN tables are not changed.",
    missing: "Server configuration missing:", queued: "Queued. An Aftercool mapping worker must be running.",
    rule: "JV is always saved. XL requires exactly one match and an EAN; otherwise XL stays empty. Starting again resumes the saved run; it does not refresh the entire catalog.",
    idle: "Not started", running: "Running", completed: "Completed", failed: "Failed — resume available",
    jv: "JV loaded", xl: "XL loaded", mapped: "JV processed", recovering: "Worker interrupted; waiting for recovery.",
    storage: "Preparing MongoDB", login: "Signing in to Aftercool",
    jv_cache: "Loading JV", xl_cache: "Loading XL", jv_mapping: "Matching JV → XL", error: "Unable to fetch status"
  },
  de: {
    title: "EAN-Synchronisierung aus Aftercool", subtitle: "JV → XL: exakte Übereinstimmung der GalleryURL.",
    start: "Starten / fortsetzen", refresh: "Status aktualisieren", loading: "Laden…",
    confirm: "Alle JV, danach XL laden und Zuordnungen in der separaten MongoDB speichern? Angebote und WareHub-EAN-Tabellen bleiben unverändert.",
    missing: "Fehlende Serverkonfiguration:", queued: "In der Warteschlange. Der Aftercool-Mapping-Worker muss laufen.",
    rule: "JV wird immer gespeichert. XL benötigt genau einen Treffer und eine EAN; sonst bleibt XL leer. Ein erneuter Start setzt den gespeicherten Lauf fort und aktualisiert nicht den gesamten Katalog.",
    idle: "Nicht gestartet", running: "Läuft", completed: "Abgeschlossen", failed: "Fehler — Fortsetzung möglich",
    jv: "JV geladen", xl: "XL geladen", mapped: "JV verarbeitet", recovering: "Worker unterbrochen; Wiederherstellung ausstehend.",
    storage: "MongoDB vorbereiten", login: "Bei Aftercool anmelden",
    jv_cache: "JV laden", xl_cache: "XL laden", jv_mapping: "JV → XL zuordnen", error: "Status konnte nicht geladen werden"
  }
} as const;

export function AftercoolMappingPanel({ token, lang }: { token: string; lang: Lang }) {
  const t = copy[lang];
  const [state, setState] = useState<MappingState | null>(null);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      let keepPolling = true;
      try {
        const next = await requestAftercoolMapping(token);
        keepPolling = next.job?.status === "queued" || next.job?.status === "running";
        if (!disposed) {
          setState(next);
          setError("");
        }
      } catch (reason) {
        if (!disposed) setError(reason instanceof Error ? reason.message : t.error);
      } finally {
        if (!disposed && keepPolling) timer = setTimeout(poll, 5000);
      }
    }
    void poll();
    return () => { disposed = true; clearTimeout(timer); };
  }, [token, refresh, t.error]);

  async function start() {
    if (!window.confirm(t.confirm)) return;
    setStarting(true);
    try {
      setState(await requestAftercoolMapping(token, true));
      setError("");
      setRefresh((value) => value + 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t.error);
    } finally {
      setStarting(false);
    }
  }

  const job = state?.job;
  const busy = job?.status === "queued" || job?.status === "running";
  const phase = job?.phase && job.phase in t ? t[job.phase as keyof typeof t] : job?.phase;
  return (
    <SectionCard title={t.title} subtitle={t.subtitle}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">{t.rule}</p>
        {!state && !error ? <p>{t.loading}</p> : null}
        {state && !state.configured ? <p role="status">{t.missing} {state.missing.join(", ")}</p> : null}
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        {job ? (
          <div className="flex flex-col gap-2" role="status" aria-live="polite">
            <p>{job.status === "queued" ? t.queued : t[job.status]}</p>
            {job.recovering ? <p>{t.recovering}</p> : null}
            {(job.status === "running" || job.status === "failed") && job.phase !== "queued" ? <p>{phase}</p> : null}
            <dl className="flex flex-wrap gap-6 text-sm">
              <div><dt>{t.jv}</dt><dd>{job.jv_loaded.toLocaleString()}</dd></div>
              <div><dt>{t.xl}</dt><dd>{job.xl_loaded.toLocaleString()}</dd></div>
              <div><dt>{t.mapped}</dt><dd>{job.mapped.toLocaleString()}</dd></div>
            </dl>
            {job.error ? <p className="text-destructive">{job.error}</p> : null}
            {job.job_id ? <p className="text-xs text-muted-foreground">Job: {job.job_id}</p> : null}
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void start()} disabled={!state?.configured || busy || starting}>{starting ? t.loading : t.start}</Button>
          <Button variant="outline" onClick={() => setRefresh((value) => value + 1)} disabled={starting}>{t.refresh}</Button>
        </div>
      </div>
    </SectionCard>
  );
}

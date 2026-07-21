import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { ScrollArea } from "../../components/ui/scroll-area";

type Labels = Record<string, string>;

type Props = {
  t: Labels;
  latestJobId: string;
  reconciliationSummary: string;
  jobStatusDetails: {
    jobId: string;
    requestId: string;
    status: string;
    attemptsCount: number;
    eventsCount: number;
  } | null;
  jobStatusJson: string;
  jobAttemptsJson: string;
  jobEventsJson: string;
  reconciliationReportId: string;
  reconciliationReportsJson: string;
  reconciliationReportJson: string;
  onLatestJobIdChange: (value: string) => void;
  onReconciliationReportIdChange: (value: string) => void;
  onLoadJobStatus: () => void;
  onLoadReconciliationReports: () => void;
  onLoadReconciliationReportById: () => void;
};

export function CreateProductJobPanel(props: Props) {
  const {
    t,
    latestJobId,
    reconciliationSummary,
    jobStatusDetails,
    jobStatusJson,
    jobAttemptsJson,
    jobEventsJson,
    reconciliationReportId,
    reconciliationReportsJson,
    reconciliationReportJson,
    onLatestJobIdChange,
    onReconciliationReportIdChange,
    onLoadJobStatus,
    onLoadReconciliationReports,
    onLoadReconciliationReportById
  } = props;

  return (
    <section className="mt-4 space-y-3 border-t border-border/70 pt-4">
      <p className="text-base font-semibold text-foreground">{t.jobStatusAndReconciliation}</p>
      <div className="wh-secondary-toolbar flex flex-wrap gap-2">
        <Input
          value={latestJobId}
          onChange={(event) => onLatestJobIdChange(event.target.value)}
          placeholder={t.productEditorJobId}
          className="max-w-[320px]"
        />
        <Button variant="secondary" onClick={onLoadJobStatus}>{t.loadJobStatus}</Button>
      </div>
      <div className="wh-secondary-toolbar flex flex-wrap gap-2">
        <Button variant="secondary" onClick={onLoadReconciliationReports}>{t.loadReconciliationByEan}</Button>
        <Input
          value={reconciliationReportId}
          onChange={(event) => onReconciliationReportIdChange(event.target.value)}
          placeholder={t.reconciliationReportIdPlaceholder}
          className="max-w-[320px]"
        />
        <Button variant="secondary" onClick={onLoadReconciliationReportById}>{t.loadReconciliationReportById}</Button>
      </div>
      {jobStatusDetails ? (
        <div className="text-xs text-muted-foreground">
          <div>{t.id}: {jobStatusDetails.jobId || "-"}</div>
          <div>{t.status}: {jobStatusDetails.status || "-"}</div>
          <div>{t.requestIdLabel}: {jobStatusDetails.requestId || "-"}</div>
          <div>{t.attemptsLabel}: {jobStatusDetails.attemptsCount}, {t.eventsLabel}: {jobStatusDetails.eventsCount}</div>
        </div>
      ) : null}
      {reconciliationSummary ? <p className="text-xs text-muted-foreground">{reconciliationSummary}</p> : null}
      {jobStatusJson ? <ScrollArea className="max-h-44 rounded-xl border bg-muted/30 p-2 text-xs"><pre>{jobStatusJson}</pre></ScrollArea> : null}
      {jobAttemptsJson ? <ScrollArea className="max-h-44 rounded-xl border bg-muted/30 p-2 text-xs"><pre>{jobAttemptsJson}</pre></ScrollArea> : null}
      {jobEventsJson ? <ScrollArea className="max-h-44 rounded-xl border bg-muted/30 p-2 text-xs"><pre>{jobEventsJson}</pre></ScrollArea> : null}
      {reconciliationReportsJson ? <ScrollArea className="max-h-44 rounded-xl border bg-muted/30 p-2 text-xs"><pre>{reconciliationReportsJson}</pre></ScrollArea> : null}
      {reconciliationReportJson ? <ScrollArea className="max-h-44 rounded-xl border bg-muted/30 p-2 text-xs"><pre>{reconciliationReportJson}</pre></ScrollArea> : null}
    </section>
  );
}

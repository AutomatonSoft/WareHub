import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useLabels } from "@/app/use-labels";

export function XLJVStatusCards({ error, syncStatus, syncLog, syncLogTitle, pretty }: { error: string | null; syncStatus: string | null; syncLog: Record<string, unknown> | null; syncLogTitle: string; pretty: (value: unknown) => string; }) {
  const t = useLabels();
  return (
    <>
      {error ? <ErrorState title={t.xljvRequestFailed} description={error} /> : null}
      {syncStatus ? (
        <Card>
          <CardContent className="pt-0">
            <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">{syncStatus}</Badge>
          </CardContent>
        </Card>
      ) : null}
      {syncLog ? (
        <Card>
          <CardHeader className="border-b"><CardTitle>{syncLogTitle}</CardTitle></CardHeader>
          <CardContent className="pt-0">
            <ScrollArea className="max-h-[320px] rounded-xl border p-3">
              <pre className="whitespace-pre-wrap break-all text-xs text-muted-foreground">{pretty(syncLog)}</pre>
            </ScrollArea>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}

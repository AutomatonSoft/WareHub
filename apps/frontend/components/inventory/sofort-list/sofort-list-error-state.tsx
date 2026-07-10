import { Copy, Stethoscope } from "lucide-react";
import { useMemo } from "react";
import { useRouter } from "next/navigation";

import { useLabels } from "@/app/use-labels";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";

function getInventoryApiErrorLabel(message: string, labels: { errorPrefix: string; unknown: string }): string {
  const httpMatch = message.match(/\bHTTP\s+(\d{3})\b/i);
  if (httpMatch) {
    return `${labels.errorPrefix} ${httpMatch[1]}`;
  }
  if (/admin session is required|no access/i.test(message)) {
    return `${labels.errorPrefix} 403`;
  }
  return `${labels.errorPrefix} ${labels.unknown}`;
}

export function SofortListErrorState({
  message,
  onRetry,
  retrying = false
}: {
  message: string;
  onRetry: () => void;
  retrying?: boolean;
}) {
  const router = useRouter();
  const t = useLabels();
  const checkedAt = useMemo(
    () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    []
  );
  const inventoryApiErrorLabel = useMemo(
    () => getInventoryApiErrorLabel(message, { errorPrefix: t.error, unknown: t.unknown }),
    [message, t.error, t.unknown]
  );

  async function copyError() {
    try {
      await navigator.clipboard.writeText(message);
    } catch {
      // Clipboard permissions can be blocked by browser policy.
    }
  }

  return (
    <div className="wh-sofort-alert wh-error-state flex w-full flex-wrap items-start justify-between gap-3 rounded-2xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-4">
      <ErrorState
        title={t.failedLoadSofortList}
        description={message}
        className="w-full border-0 bg-transparent p-0 shadow-none"
      />

      <div className="flex w-full flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={onRetry} disabled={retrying}>
          {retrying ? t.retrying : t.retry}
        </Button>
        <Button type="button" variant="outline" onClick={() => void copyError()}>
          <Copy />
          {t.copyError}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push("/marketplace")}>
          <Stethoscope />
          {t.openDiagnostics}
        </Button>
      </div>

      <div className="w-full rounded-xl border border-[#FECACA] bg-white px-3 py-2 text-xs text-[#64748B]">
        {t.inventoryApi}: <span className="font-medium text-destructive">{inventoryApiErrorLabel}</span> · {t.lastChecked}: {checkedAt} · {t.marketplaceSync}: {t.unknown}
      </div>
    </div>
  );
}

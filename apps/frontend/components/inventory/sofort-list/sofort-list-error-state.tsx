import { Copy, Stethoscope } from "lucide-react";
import { useMemo } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";

function getInventoryApiErrorLabel(message: string): string {
  const httpMatch = message.match(/\bHTTP\s+(\d{3})\b/i);
  if (httpMatch) {
    return `Error ${httpMatch[1]}`;
  }
  if (/admin session is required|no access/i.test(message)) {
    return "Error 403";
  }
  return "Error unknown";
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
  const checkedAt = useMemo(
    () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    []
  );
  const inventoryApiErrorLabel = useMemo(() => getInventoryApiErrorLabel(message), [message]);

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
        title="Failed to load sofort list"
        description={message}
        className="w-full border-0 bg-transparent p-0 shadow-none"
      />

      <div className="flex w-full flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={onRetry} disabled={retrying}>
          {retrying ? "Retrying..." : "Retry"}
        </Button>
        <Button type="button" variant="outline" onClick={() => void copyError()}>
          <Copy />
          Copy error
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push("/marketplace")}>
          <Stethoscope />
          Open diagnostics
        </Button>
      </div>

      <div className="w-full rounded-xl border border-[#FECACA] bg-white px-3 py-2 text-xs text-[#64748B]">
        Inventory API: <span className="font-medium text-destructive">{inventoryApiErrorLabel}</span> · Last checked: {checkedAt} · Marketplace Sync: Unknown
      </div>
    </div>
  );
}

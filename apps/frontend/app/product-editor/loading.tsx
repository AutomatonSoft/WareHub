import { LoadingState } from "@/components/ui/loading-state";
import { PageShell } from "@/components/ui/page-shell";

export default function Loading() {
  return (
    <PageShell>
      <LoadingState title="Loading product editor..." />
    </PageShell>
  );
}


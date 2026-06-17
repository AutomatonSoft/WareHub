import { Suspense } from "react";
import { AppShell } from "../../components/layout/app-shell";
import { MarketplaceGrid } from "../../components/marketplace/marketplace-grid";
import { LoadingState } from "../../components/ui/loading-state";

export default function MarketplacePage() {
  return (
    <AppShell
      title="Marketplace"
      subtitle="Integration command center for Otto, Kaufland, and Hood"
    >
      <Suspense fallback={<LoadingState title="Loading marketplace..." />}>
        <MarketplaceGrid />
      </Suspense>
    </AppShell>
  );
}

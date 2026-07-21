import { Suspense } from "react";
import { AppShell } from "../../components/layout/app-shell";
import { MarketplaceGrid } from "../../components/marketplace/marketplace-grid";
import { LoadingState } from "../../components/ui/loading-state";

export default function MarketplacePage() {
  return (
    <AppShell
      titleKey="navMarketplace"
      subtitleKey="marketplaceSubtitle"
    >
      <Suspense fallback={<LoadingState titleKey="loadingMarketplace" />}>
        <MarketplaceGrid />
      </Suspense>
    </AppShell>
  );
}

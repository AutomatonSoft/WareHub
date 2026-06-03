import { Suspense } from "react";
import { AppShell } from "../../components/layout/app-shell";
import { MarketplaceGrid } from "../../components/marketplace/marketplace-grid";
import { Card, CardContent } from "../../components/ui/card";
import { LoadingState } from "../../components/ui/loading-state";

export default function MarketplacePage() {
  return (
    <AppShell
      title="Marketplace"
      subtitle="Integration command center for Otto, Kaufland, and Hood"
    >
      <Card className="wh-page-card wh-marketplace-page shadow-sm">
        <CardContent className="pt-0">
        <Suspense fallback={<LoadingState title="Loading marketplace..." />}>
          <MarketplaceGrid />
        </Suspense>
        </CardContent>
      </Card>
    </AppShell>
  );
}

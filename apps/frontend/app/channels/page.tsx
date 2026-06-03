import { Suspense } from "react";
import { AppShell } from "../../components/layout/app-shell";
import { ChannelsView, type ChannelsTab } from "../../components/channels/channels-view";
import { Card, CardContent } from "../../components/ui/card";
import { LoadingState } from "../../components/ui/loading-state";

type ChannelsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function normalizeInitialTab(value: string | null): ChannelsTab | null {
  if (
    value === "hood" ||
    value === "xl" ||
    value === "jv" ||
    value === "kaufland" ||
    value === "otto" ||
    value === "ebay"
  ) {
    return value;
  }
  if (value === "xljv") return "xl";
  return null;
}

export default async function ChannelsPage({ searchParams }: ChannelsPageProps) {
  const resolvedSearchParams = await searchParams;
  const rawTab = resolvedSearchParams?.tab;
  const initialTab = normalizeInitialTab(Array.isArray(rawTab) ? rawTab[0] ?? null : rawTab ?? null) ?? "hood";

  return (
    <AppShell title="Channels" subtitle="Unified search for Hood, XL/JV, Kaufland, Otto and Ebay">
      <Card className="wh-page-card wh-channels-page shadow-sm">
        <CardContent className="pt-0">
          <Suspense fallback={<LoadingState title="Loading channels..." />}>
            <ChannelsView initialTab={initialTab} />
          </Suspense>
        </CardContent>
      </Card>
    </AppShell>
  );
}

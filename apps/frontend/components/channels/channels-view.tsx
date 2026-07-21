"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLabels } from "../../app/use-labels";
import { Card, CardContent } from "../ui/card";
import { SegmentedTabs } from "../ui/segmented-tabs";
import { SectionHeader } from "../ui/section-header";

const HoodSearchPanel = dynamic(() => import("../hood/hood-search-panel").then((mod) => mod.HoodSearchPanel), {
  loading: () => null
});
const XLJVSearchPanel = dynamic(() => import("../xljv/xljv-search-panel").then((mod) => mod.XLJVSearchPanel), {
  loading: () => null,
  ssr: false
});
const KauflandSearchPanel = dynamic(
  () => import("./kaufland-search-panel").then((mod) => mod.KauflandSearchPanel),
  { loading: () => null }
);
const ChannelPlaceholderPanel = dynamic(
  () => import("./channel-placeholder-panel").then((mod) => mod.ChannelPlaceholderPanel),
  { loading: () => null }
);

export type ChannelsTab = "hood" | "xl" | "jv" | "kaufland" | "otto" | "ebay";

const TAB_STORAGE_KEY = "channels_active_tab";

export function normalizeChannelsTab(value: string | null): ChannelsTab | null {
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

export function ChannelsView({ initialTab = "hood" }: { initialTab?: ChannelsTab } = {}) {
  const t = useLabels();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const channelTabs: Array<{ value: ChannelsTab; label: string }> = [
    { value: "hood", label: t.channelHood },
    { value: "xl", label: t.channelXl },
    { value: "jv", label: t.channelJv },
    { value: "kaufland", label: t.channelKaufland },
    { value: "otto", label: t.channelOtto },
    { value: "ebay", label: t.channelEbay }
  ];

  const paramTab = useMemo(() => normalizeChannelsTab(searchParams.get("tab")), [searchParams]);
  const [activeTab, setActiveTab] = useState<ChannelsTab>(initialTab);

  useEffect(() => {
    if (paramTab) {
      setActiveTab(paramTab);
      return;
    }

    const stored = normalizeChannelsTab(window.localStorage.getItem(TAB_STORAGE_KEY));
    if (stored) {
      setActiveTab(stored);
    }
  }, [paramTab]);

  useEffect(() => {
    window.localStorage.setItem(TAB_STORAGE_KEY, activeTab);

    if (paramTab === activeTab) {
      return;
    }

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("tab", activeTab);
    router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
  }, [activeTab, paramTab, pathname, router, searchParams]);

  return (
    <>
      <SectionHeader
        title={t.channelWorkspace}
        description={t.switchLiveChannelPanelsWithoutChangingBackendWorkflows}
        actions={
          <SegmentedTabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as ChannelsTab)}
            items={channelTabs.map((tab) => ({ id: tab.value, label: tab.label }))}
            className="w-full md:w-auto"
          />
        }
      />

      <Card className="wh-command-panel border-border shadow-[var(--wh-shadow-card)]">
        <CardContent className="p-5 sm:p-6">
          {activeTab === "hood" ? <HoodSearchPanel /> : null}
          {activeTab === "xl" ? <XLJVSearchPanel initialSite="XL" /> : null}
          {activeTab === "jv" ? <XLJVSearchPanel initialSite="JV" /> : null}
          {activeTab === "kaufland" ? <KauflandSearchPanel /> : null}
          {activeTab === "otto" ? (
            <ChannelPlaceholderPanel
              channelName={t.channelOtto}
              hint={t.endpointIntegrationPreparedNextStep}
            />
          ) : null}
          {activeTab === "ebay" ? (
            <ChannelPlaceholderPanel
              channelName={t.channelEbay}
              hint={t.endpointIntegrationPreparedNextStep}
            />
          ) : null}
          <div className="wh-channels-helper-panel mt-5 bg-muted/20 px-1 py-3">
            <p className="text-sm font-semibold text-foreground">{t.resultPanel}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t.useTabsToSwitchLiveChannelPanelsSearchPatchBehaviorUnchanged}
            </p>
            <div className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
              <div>
                <p className="font-medium text-foreground">{t.activeChannel}</p>
                <p className="mt-0.5 text-muted-foreground">{channelTabs.find((tab) => tab.value === activeTab)?.label ?? t.channelHood}</p>
              </div>
              <div>
                <p className="font-medium text-foreground">{t.currentState}</p>
                <p className="mt-0.5 text-muted-foreground">{t.commandPanelReadyBackendFlowUnchanged}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

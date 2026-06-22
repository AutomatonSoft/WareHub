"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
const CHANNEL_TABS: Array<{
  value: ChannelsTab;
  label: string;
}> = [
  { value: "hood", label: "Hood" },
  { value: "xl", label: "XL" },
  { value: "jv", label: "JV" },
  { value: "kaufland", label: "Kaufland" },
  { value: "otto", label: "Otto" },
  { value: "ebay", label: "Ebay" }
];

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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

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
        title="Channel workspace"
        description="Switch live channel panels without changing backend workflows."
        actions={
          <SegmentedTabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as ChannelsTab)}
            items={CHANNEL_TABS.map((tab) => ({ id: tab.value, label: tab.label }))}
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
              channelName="Otto"
              hint="Endpoint integration is prepared. Product search block will be connected in the next step."
            />
          ) : null}
          {activeTab === "ebay" ? (
            <ChannelPlaceholderPanel
              channelName="Ebay"
              hint="Endpoint integration is prepared. Product search block will be connected in the next step."
            />
          ) : null}
          <div className="wh-channels-helper-panel mt-5 bg-muted/20 px-1 py-3">
            <p className="text-sm font-semibold text-foreground">Result panel</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Use tabs to switch live channel panels. Search/patch behavior and backend workflows are unchanged.
            </p>
            <div className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
              <div>
                <p className="font-medium text-foreground">Active channel</p>
                <p className="mt-0.5 text-muted-foreground">{CHANNEL_TABS.find((tab) => tab.value === activeTab)?.label ?? "Hood"}</p>
              </div>
              <div>
                <p className="font-medium text-foreground">Current state</p>
                <p className="mt-0.5 text-muted-foreground">Command panel is ready. Backend flow unchanged.</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

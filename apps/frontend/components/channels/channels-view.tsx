"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Blocks, Database, Search, ShoppingBag, Store } from "lucide-react";
import { SectionTitle } from "../shared/section-title";
import { cn } from "../../lib/cn";
import { Card, CardContent } from "../ui/card";
import { SegmentedTabs } from "../ui/segmented-tabs";

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
  icon: typeof Search;
}> = [
  { value: "hood", label: "Hood", icon: Search },
  { value: "xl", label: "XL", icon: Database },
  { value: "jv", label: "JV", icon: Database },
  { value: "kaufland", label: "Kaufland", icon: Store },
  { value: "otto", label: "Otto", icon: ShoppingBag },
  { value: "ebay", label: "Ebay", icon: Blocks }
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
      <SectionTitle
        title="Channels"
        subtitle="Unified workspace for Hood, XL, JV, Kaufland, Otto and Ebay"
        action={
          <SegmentedTabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as ChannelsTab)}
            items={CHANNEL_TABS.map((tab) => ({ id: tab.value, label: tab.label }))}
            className="w-full md:w-auto"
          />
        }
      />

      <Card className="wh-command-panel border-border shadow-sm">
        <CardContent className="p-5 sm:p-6">
          <div className="wh-channels-chip-row mb-5 flex flex-wrap gap-2">
            {CHANNEL_TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <div
                  key={`channel-chip-${tab.value}`}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium",
                    activeTab === tab.value
                      ? "border-primary/30 bg-primary/10 text-primary"
                      : "border-border bg-muted/50 text-muted-foreground"
                  )}
                >
                  <Icon size={13} />
                  <span>{tab.label}</span>
                </div>
              );
            })}
          </div>
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
          <div className="wh-channels-helper-panel mt-5 rounded-xl border border-border/70 bg-muted/20 p-4">
            <p className="text-sm font-semibold text-foreground">Result panel</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Use tabs to switch live channel panels. Search/patch behavior and backend workflows are unchanged.
            </p>
            <div className="mt-3 grid gap-2 rounded-lg border border-border/70 bg-background/75 p-3 text-xs sm:grid-cols-2">
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

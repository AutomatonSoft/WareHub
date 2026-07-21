"use client";

import { Suspense } from "react";
import { AppShell } from "../../../components/layout/app-shell";
import { SectionTitle } from "../../../components/shared/section-title";
import { XLJVEditPanel } from "../../../components/xljv/xljv-edit-panel";
import { LoadingState } from "../../../components/ui/loading-state";
import { useLabels } from "../../use-labels";

export default function XLJVEditPage() {
  const t = useLabels();

  return (
    <AppShell title={t.xljvTitle ?? "XL / JV"} subtitle={t.xljvSubtitle ?? "Edit saved product"}>
      <SectionTitle
        title={t.xljvEditTitle ?? "XL/JV Edit"}
        subtitle={t.xljvEditSubtitle ?? "Edit locally saved fields by EAN and site"}
      />
      <Suspense fallback={<LoadingState titleKey="loadingXljvEditor" />}>
        <XLJVEditPanel />
      </Suspense>
    </AppShell>
  );
}

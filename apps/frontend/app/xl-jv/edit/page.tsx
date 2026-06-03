import { Suspense } from "react";
import { AppShell } from "../../../components/layout/app-shell";
import { SectionTitle } from "../../../components/shared/section-title";
import { XLJVEditPanel } from "../../../components/xljv/xljv-edit-panel";
import { LoadingState } from "../../../components/ui/loading-state";

export default function XLJVEditPage() {
  return (
    <AppShell title="XL / JV" subtitle="Edit saved product">
      <SectionTitle
        title="XL/JV Edit"
        subtitle="Edit locally saved fields by EAN and site"
      />
      <Suspense fallback={<LoadingState title="Loading XL/JV editor..." />}>
        <XLJVEditPanel />
      </Suspense>
    </AppShell>
  );
}

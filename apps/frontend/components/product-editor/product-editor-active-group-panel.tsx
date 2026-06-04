import { findGroup, hasActionableHoodTarget, hasActionableJvTarget } from "./product-editor-model";
import { ProductEditorHoodPanel } from "./product-editor-hood-panel";
import { ProductEditorJobPanel } from "./product-editor-job-panel";
import { ProductEditorJvPanel } from "./product-editor-jv-panel";
import { PRODUCT_EDITOR_PLACEHOLDER_DETAILS, PRODUCT_EDITOR_TAB_COPY } from "./product-editor-copy";
import { ProductEditorEmptyPanel } from "./product-editor-shared-panels";
import type {
  ProductEditorDiscoverResponse,
  ProductEditorGroupId,
  ProductEditorHoodDraft,
  ProductEditorJvDraft,
  ProductEditorJobResponse,
  ProductEditorPlanResponse
} from "./product-editor-types";

export function ProductEditorActiveGroupPanel(input: {
  discover: ProductEditorDiscoverResponse | null;
  activeGroupId: ProductEditorGroupId;
  activeTabLabel: string;
  hoodDraft: ProductEditorHoodDraft;
  initialHoodDraft: ProductEditorHoodDraft;
  hoodWarnings: ProductEditorDiscoverResponse["warnings"];
  hoodLoading: boolean;
  onPatchHood: (patch: Partial<ProductEditorHoodDraft>) => void;
  jvDraft: ProductEditorJvDraft;
  initialJvDraft: ProductEditorJvDraft;
  jvWarnings: ProductEditorDiscoverResponse["warnings"];
  jvLoading: boolean;
  onPatchJv: (patch: Partial<ProductEditorJvDraft>) => void;
  hoodChangedFields: string[];
  jvChangedFields: string[];
  hoodApplyLoading: boolean;
  hoodImageUploadLoading: boolean;
  planResponse: ProductEditorPlanResponse | null;
  planLoading: boolean;
  applyLoading: boolean;
  applyConfirmed: boolean;
  setApplyConfirmed: (checked: boolean) => void;
  onReviewChanges: () => void;
  onApplyPlan: () => void;
  jobResponse: ProductEditorJobResponse | null;
  jobLoading: boolean;
  onRefreshJob: () => void;
  eanValue: string;
  isEanValid: boolean;
  searching: boolean;
  onChangeEan: (value: string) => void;
  onSearch: () => void;
  hasLocalLoadedHood: boolean;
  hasLocalLoadedJv: boolean;
  jvBatchApplyLoading: boolean;
  onRemoveHoodImage: (imageUrl: string) => void;
  onReorderHoodImages: (sourceImageUrl: string, targetImageUrl: string) => void;
  onUploadHoodMainFiles: (files: FileList | null) => void;
  onUploadHoodAdditionalFiles: (files: FileList | null) => void;
  onApplyHoodEditedProducts: () => void;
  onApplyJvEditedProducts: () => void;
}) {
  const activeTabUpper = input.activeTabLabel.toUpperCase();
  const activeVariant = activeTabUpper.endsWith(" XL")
    ? "XL"
    : activeTabUpper.endsWith(" JV")
      ? "JV"
      : null;

  if (input.activeGroupId === "HOOD") {
    const hoodGroup = findGroup(input.discover, "HOOD");
    if (!input.discover && !input.hasLocalLoadedHood) {
      return (
        <ProductEditorEmptyPanel
          title={`${input.activeTabLabel} tab`}
          body={`Run discover first so orchestrator can resolve ${input.activeTabLabel} targets.`}
          eanValue={input.eanValue}
          isEanValid={input.isEanValid}
          searching={input.searching}
          onChangeEan={input.onChangeEan}
          onSearch={input.onSearch}
        />
      );
    }
    if (input.discover && !hasActionableHoodTarget(hoodGroup) && !input.hasLocalLoadedHood) {
      return (
        <ProductEditorEmptyPanel
          title={`${input.activeTabLabel} target not found`}
          body={`For this EAN, orchestrator did not find ${input.activeTabLabel} targets. The tab remains read-only and sends nothing.`}
          eanValue={input.eanValue}
          isEanValid={input.isEanValid}
          searching={input.searching}
          onChangeEan={input.onChangeEan}
          onSearch={input.onSearch}
        />
      );
    }
    return (
      <div className="space-y-2.5">
        <ProductEditorHoodPanel
          draft={input.hoodDraft}
          initialDraft={input.initialHoodDraft}
          loading={input.hoodLoading}
          warnings={input.hoodWarnings}
          changedFields={input.hoodChangedFields}
          applyLoading={input.hoodApplyLoading}
          imageUploadLoading={input.hoodImageUploadLoading}
          onChange={input.onPatchHood}
          onRemoveImage={input.onRemoveHoodImage}
          onReorderImages={input.onReorderHoodImages}
          onUploadMainFiles={input.onUploadHoodMainFiles}
          onUploadAdditionalFiles={input.onUploadHoodAdditionalFiles}
          onApplyEditedProducts={input.onApplyHoodEditedProducts}
        />
        <ProductEditorJobPanel job={input.jobResponse} loading={input.jobLoading} onRefresh={input.onRefreshJob} />
      </div>
    );
  }

  if (input.activeGroupId === "JV") {
    const jvGroup = findGroup(input.discover, "JV");
    if (!input.discover && !input.hasLocalLoadedJv) {
      return (
        <ProductEditorEmptyPanel
          title="JV tab"
          body="Run discover first so orchestrator can resolve found JV sites."
          eanValue={input.eanValue}
          isEanValid={input.isEanValid}
          searching={input.searching}
          onChangeEan={input.onChangeEan}
          onSearch={input.onSearch}
        />
      );
    }
    if (input.discover && !hasActionableJvTarget(jvGroup) && !input.hasLocalLoadedJv) {
      return (
        <ProductEditorEmptyPanel
          title="JV sites not found"
          body="For this EAN, orchestrator did not find actionable JV sites. The tab remains read-only and sends nothing."
          eanValue={input.eanValue}
          isEanValid={input.isEanValid}
          searching={input.searching}
          onChangeEan={input.onChangeEan}
          onSearch={input.onSearch}
        />
      );
    }
    return (
      <div className="space-y-2.5">
        <ProductEditorJvPanel
          draft={input.jvDraft}
          initialDraft={input.initialJvDraft}
          loading={input.jvLoading}
          warnings={input.jvWarnings}
          onChange={input.onPatchJv}
          activeTabLabel={input.activeTabLabel}
          batchApplyLoading={input.jvBatchApplyLoading}
          jobResponse={input.jobResponse}
          onApplyEditedProducts={input.onApplyJvEditedProducts}
        />
        <ProductEditorJobPanel job={input.jobResponse} loading={input.jobLoading} onRefresh={input.onRefreshJob} />
      </div>
    );
  }

  const details =
    PRODUCT_EDITOR_PLACEHOLDER_DETAILS[input.activeGroupId as keyof typeof PRODUCT_EDITOR_PLACEHOLDER_DETAILS] ??
    ["This tab is intentionally non-actionable in the current phase."];
  const variantHint = activeVariant ? `Active source variant: ${activeVariant}.` : "";
  const tabHint = `Active tab: ${input.activeTabLabel}.`;
  const body = [tabHint, details[0], variantHint].filter(Boolean).join(" ");
  return (
    <ProductEditorEmptyPanel
      title={`${input.activeTabLabel} tab`}
      body={body || PRODUCT_EDITOR_TAB_COPY[input.activeGroupId].subtitle}
      eanValue={input.eanValue}
      isEanValid={input.isEanValid}
      searching={input.searching}
      onChangeEan={input.onChangeEan}
      onSearch={input.onSearch}
    />
  );
}

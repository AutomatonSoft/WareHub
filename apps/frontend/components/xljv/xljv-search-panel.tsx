"use client";

import { XLJVCreatePanel } from "./xljv-create-panel";
import { XLJVSearchResults } from "./xljv-search-results";
import { pretty, Site } from "./xljv-search-utils";
import { XLJVSearchToolbar } from "./search-panel/xljv-search-toolbar";
import { XLJVStatusCards } from "./search-panel/xljv-status-cards";
import { XLJVLoadingState } from "./search-panel/xljv-loading-state";
import { XLJVEmptyState } from "./search-panel/xljv-empty-state";
import { XLJVErrorState } from "./search-panel/xljv-error-state";
import { useXLJVSearchController } from "./search-panel/use-xljv-search-controller";

export function XLJVSearchPanel({ initialSite }: { initialSite?: Site } = {}) {
  const controller = useXLJVSearchController(initialSite);
  const t = controller.t;

  return (
    <div className="space-y-4">
      <XLJVSearchToolbar
        ean={controller.ean}
        site={controller.site}
        siteKey={controller.siteKey}
        siteKeyOptions={controller.siteKeyOptions}
        loading={controller.loading}
        syncLoading={controller.syncLoading}
        allXlLoading={controller.allXlLoading}
        createProductLoading={controller.createProductLoading}
        createProductSendLoading={controller.createProductSendLoading}
        translateTexts={controller.translateTexts}
        autoDetectSourceLanguage={controller.autoDetectSourceLanguage}
        convertCurrency={controller.convertCurrency}
        onSearch={controller.handleSearch}
        onSetEan={controller.setEan}
        onSetSiteKey={controller.setSiteKey}
        onSetSite={controller.setSite}
        onSync={controller.handleSync}
        onSearchAllSites={controller.handleSearchAllSites}
        onCreateProduct={controller.handleCreateProduct}
        onCancelCreate={() => controller.setCreateForm(() => null)}
        createForm={controller.createForm}
        onSetTranslateTexts={controller.setTranslateTexts}
        onSetAutoDetectSourceLanguage={controller.setAutoDetectSourceLanguage}
        onSetConvertCurrency={controller.setConvertCurrency}
        siteLocked={Boolean(initialSite)}
        labels={{
          loading: t.loading,
          searchLabel: t.searchLabel,
          syncing: t.syncing,
          syncFromSource: t.syncFromSource,
          searching: t.searching,
          searchAllSites: t.searchAllSites,
          preparing: t.preparing,
          create: t.create,
          cancelShort: t.cancelShort,
          translateTexts: t.translateTexts,
          autoDetectSourceLanguage: t.autoDetectSourceLanguage,
          convertCurrency: t.convertCurrency
        }}
      />
      <XLJVCreatePanel
        site={controller.site}
        createProductSendLoading={controller.createProductSendLoading}
        createImageUploadLoading={controller.createImageUploadLoading}
        createAllSitesLoading={controller.createAllSitesLoading}
        rubricsLoading={controller.rubricsLoading}
        rubrics={controller.rubrics}
        selectedRubricIds={controller.selectedRubricIds}
        mainRubricId={controller.mainRubricId}
        deliveryOptions={controller.deliveryOptions}
        deliveryOptionsLoading={controller.deliveryOptionsLoading}
        createForm={controller.createForm}
        onLoadRubrics={controller.handleLoadRubrics}
        onToggleRubric={controller.handleToggleRubric}
        onSetMainRubric={controller.handleSetMainRubric}
        onLoadDeliveryOptions={controller.handleLoadDeliveryOptions}
        onSetCreateForm={controller.setCreateForm}
        onCreateImageUpload={controller.handleCreateImageUpload}
        onSendCreatedProduct={controller.handleSendCreatedProduct}
        onSendCreatedProductToAllSites={controller.handleSendCreatedProductToAllSites}
      />

      <XLJVStatusCards error={controller.error} syncStatus={controller.syncStatus} syncLog={controller.syncLog} syncLogTitle={t.syncLog} pretty={pretty} />
      {controller.error ? <XLJVErrorState message={controller.error} /> : null}
      {controller.loading || controller.allXlLoading ? <XLJVLoadingState /> : null}
      {!controller.loading && !controller.allXlLoading && !controller.item && !controller.allXlResult && !controller.orderDraft ? (
        <XLJVEmptyState message={t.xljvNoProductLoadedYet} />
      ) : null}

      <XLJVSearchResults
        site={controller.site}
        allXlResult={controller.allXlResult}
        selectedSiteKeys={controller.selectedSiteKeys}
        templateSiteKey={controller.templateSiteKey}
        createOrderLoading={controller.createOrderLoading}
        sendSelectedLoading={controller.sendSelectedLoading}
        batchLanguageMapsAttempted={controller.batchLanguageMapsAttempted}
        batchLanguageMaps={controller.batchLanguageMaps}
        orderDraft={controller.orderDraft}
        item={controller.item}
        onToggleSelectedSite={controller.toggleSelectedSite}
        onSetTemplateSiteKey={controller.setTemplateSiteKey}
        onCreateOrder={controller.handleCreateOrder}
        onCreateOrderDraft={controller.handleCreateOrderDraft}
        onSendToSelectedSites={controller.handleSendToSelectedSites}
        onSetOrderDraft={controller.setOrderDraft}
      />
    </div>
  );
}

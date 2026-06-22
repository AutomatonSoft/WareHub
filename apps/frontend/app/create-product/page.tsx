"use client";

import { useLabels } from "../use-labels";
import { AppShell } from "../../components/layout/app-shell";
import { useToast } from "../../components/shared/toast-provider";
import { Badge } from "../../components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { EmptyState } from "../../components/ui/empty-state";
import { Surface } from "../../components/ui/surface";
import { CreateProductFormPanel } from "./create-product-form-panel";
import { CreateProductJobPanel } from "./create-product-job-panel";
import { MarketplaceSiteSelectorPanel } from "./marketplace-site-selector-panel";
import { useCreateProductController } from "./use-create-product-controller";

export default function CreateProductPage() {
  const t = useLabels();
  const { showToast } = useToast();
  const controller = useCreateProductController({ t, showToast });

  return (
    <AppShell
      title={t.createProduct || "Create Product"}
      subtitle={t.chooseSitesAndFillFields || "Choose target sites and fill common product fields"}
    >
      <div className="wh-create-product-page grid items-start gap-4 xl:grid-cols-[1.45fr_0.55fr]">
        <div className="min-w-0">
          {controller.selectedSites.length > 0 ? (
            <Card className="wh-page-card border-border bg-card shadow-[var(--wh-shadow-card)]">
              <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
                <CardTitle className="text-base">{t.commonFields}</CardTitle>
                <Badge variant="secondary" className="wh-count-badge">{t.sites}: {controller.selectedSites.length}</Badge>
              </CardHeader>
              <CardContent>
              <div className="wh-setup-flow mb-4 p-0">
                <p className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">Setup flow</p>
                <ol className="mt-2 grid gap-2 text-sm text-foreground md:grid-cols-3">
                  <li className="wh-setup-flow__step is-done">1. Select target sites</li>
                  <li className="wh-setup-flow__step is-active">2. Fill common product fields</li>
                  <li className="wh-setup-flow__step">3. Create draft/product</li>
                </ol>
              </div>
              <CreateProductFormPanel
                t={t}
                ean={controller.ean}
                price={controller.price}
                productName={controller.productName}
                imagesText={controller.imagesText}
                fieldErrors={controller.fieldErrors}
                submitting={controller.submitting}
                useControlledJob={controller.useControlledJob}
                onEanChange={(value) => {
                  controller.setEan(value);
                  controller.setFieldErrors((current) => ({ ...current, ean: undefined }));
                }}
                onPriceChange={(value) => {
                  controller.setPrice(value);
                  controller.setFieldErrors((current) => ({ ...current, price: undefined }));
                }}
                onProductNameChange={(value) => {
                  controller.setProductName(value);
                  controller.setFieldErrors((current) => ({ ...current, productName: undefined }));
                }}
                onImagesTextChange={controller.setImagesText}
                onSubmit={() => void controller.handleCreateProduct()}
                onReset={controller.resetFields}
                onToggleControlledMode={() => controller.setUseControlledJob((prev) => !prev)}
              />
              <CreateProductJobPanel
                t={t}
                latestJobId={controller.latestJobId}
                reconciliationSummary={controller.reconciliationSummary}
                jobStatusDetails={controller.jobStatusDetails}
                jobStatusJson={controller.jobStatusJson}
                jobAttemptsJson={controller.jobAttemptsJson}
                jobEventsJson={controller.jobEventsJson}
                reconciliationReportId={controller.reconciliationReportId}
                reconciliationReportsJson={controller.reconciliationReportsJson}
                reconciliationReportJson={controller.reconciliationReportJson}
                onLatestJobIdChange={controller.setLatestJobId}
                onReconciliationReportIdChange={controller.setReconciliationReportId}
                onLoadJobStatus={() => void controller.loadJobStatus()}
                onLoadReconciliationReports={() => void controller.loadReconciliationReports()}
                onLoadReconciliationReportById={() => void controller.loadReconciliationReportById()}
              />
              </CardContent>
            </Card>
          ) : (
            <Surface className="wh-page-card h-full">
              <div className="pt-0">
                <div className="wh-setup-flow mb-4 p-0">
                  <p className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">Setup flow</p>
                  <ol className="mt-2 grid gap-2 text-sm text-foreground md:grid-cols-3">
                    <li className="wh-setup-flow__step is-active">1. Select target sites</li>
                    <li className="wh-setup-flow__step">2. Fill common product fields</li>
                    <li className="wh-setup-flow__step">3. Create draft/product</li>
                  </ol>
                </div>
                <div className="mb-3 bg-primary/10 px-3 py-2 text-xs text-primary">
                  <p className="font-semibold">Waiting for target sites</p>
                  <p className="mt-0.5 text-primary/80">Select one or more sites on the right. Common fields and create actions will appear here.</p>
                </div>
                <EmptyState title={t.commonFields} description={t.selectSitesToStart} className="min-h-36 border-0 bg-transparent shadow-none" />
              </div>
            </Surface>
          )}
        </div>

        <MarketplaceSiteSelectorPanel
          t={t}
          selectedSitesCount={controller.selectedSites.length}
          sitesQuery={controller.sitesQuery}
          showSelectedOnly={controller.showSelectedOnly}
          visibleSites={controller.visibleSites}
          selectedSiteIds={controller.selectedSites}
          onSitesQueryChange={controller.setSitesQuery}
          onSelectAllSites={controller.selectAllSites}
          onClearAllSites={controller.clearAllSites}
          onToggleShowSelectedOnly={() => controller.setShowSelectedOnly((prev) => !prev)}
          onToggleSite={controller.toggleSite}
        />
      </div>
    </AppShell>
  );
}

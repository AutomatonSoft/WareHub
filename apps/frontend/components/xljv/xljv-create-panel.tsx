"use client";

import { Card, CardContent, CardFooter } from "../ui/card";
import { Separator } from "../ui/separator";
import { XLJVCreateForm } from "./xljv-create-form";
import { RubricTreeNode, Site, XLJVCreateFormState } from "./xljv-search-utils";

type XLJVCreatePanelProps = {
  site: Site;
  createForm: XLJVCreateFormState | null;
  createProductSendLoading: boolean;
  createImageUploadLoading: boolean;
  createAllSitesLoading: boolean;
  rubricsLoading: boolean;
  rubrics: RubricTreeNode[];
  selectedRubricIds: number[];
  mainRubricId: number | null;
  deliveryOptions: Array<{ id: number; label: string; is_default?: boolean }>;
  deliveryOptionsLoading: boolean;
  onLoadRubrics: () => Promise<void>;
  onToggleRubric: (id: number) => void;
  onSetMainRubric: (id: number) => void;
  onLoadDeliveryOptions: () => Promise<void>;
  onSetCreateForm: (updater: (prev: XLJVCreateFormState | null) => XLJVCreateFormState | null) => void;
  onCreateImageUpload: (files: FileList | null) => Promise<void>;
  onSendCreatedProduct: () => Promise<void>;
  onSendCreatedProductToAllSites: () => Promise<void>;
};

export function XLJVCreatePanel(props: XLJVCreatePanelProps) {
  if (!props.createForm) return null;

  return (
    <Card>
      <CardContent className="pt-4">
        <XLJVCreateForm
          site={props.site}
          createForm={props.createForm}
          createProductSendLoading={props.createProductSendLoading}
          createImageUploadLoading={props.createImageUploadLoading}
          createAllSitesLoading={props.createAllSitesLoading}
          rubricsLoading={props.rubricsLoading}
          rubrics={props.rubrics}
          selectedRubricIds={props.selectedRubricIds}
          mainRubricId={props.mainRubricId}
          deliveryOptions={props.deliveryOptions}
          deliveryOptionsLoading={props.deliveryOptionsLoading}
          onLoadRubrics={props.onLoadRubrics}
          onToggleRubric={props.onToggleRubric}
          onSetMainRubric={props.onSetMainRubric}
          onLoadDeliveryOptions={props.onLoadDeliveryOptions}
          onSetCreateForm={props.onSetCreateForm}
          onCreateImageUpload={props.onCreateImageUpload}
          onSendCreatedProduct={props.onSendCreatedProduct}
          onSendCreatedProductToAllSites={props.onSendCreatedProductToAllSites}
        />
      </CardContent>
      <Separator />
      <CardFooter className="text-xs text-muted-foreground">{props.site} create workflow</CardFooter>
    </Card>
  );
}

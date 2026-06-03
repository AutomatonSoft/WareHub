import type { FormEvent } from "react";

import type {
  RubricTreeNode,
  Site,
  SiteLanguageMapPreview,
  XLAllSitesResult,
  XLJVCreateFormState,
  XLJVResponse
} from "../xljv-search-utils";

export type XLJVOrderDraft = {
  name: string;
  description: string;
  tag: string;
  meta_title: string;
  meta_description: string;
  meta_keyword: string;
  default_price: string;
};

export type XLJVPanelControlsProps = {
  ean: string;
  site: Site;
  siteLocked: boolean;
  siteKey: string;
  siteKeyOptions: Array<{ value: string; label: string }>;
  loading: boolean;
  syncLoading: boolean;
  allXlLoading: boolean;
  createProductLoading: boolean;
  createProductSendLoading: boolean;
  createImageUploadLoading: boolean;
  createAllSitesLoading: boolean;
  rubricsLoading: boolean;
  rubrics: RubricTreeNode[];
  selectedRubricIds: number[];
  mainRubricId: number | null;
  translateTexts: boolean;
  autoDetectSourceLanguage: boolean;
  convertCurrency: boolean;
  deliveryOptions: Array<{ id: number; label: string; is_default?: boolean }>;
  deliveryOptionsLoading: boolean;
  createForm: XLJVCreateFormState | null;
  onSearch: (event: FormEvent<HTMLFormElement>) => void;
  onSetEan: (value: string) => void;
  onSetSiteKey: (value: string) => void;
  onSetSite: (site: Site) => void;
  onSync: () => Promise<void>;
  onSearchAllSites: () => Promise<void>;
  onCreateProduct: () => Promise<void>;
  onLoadRubrics: () => Promise<void>;
  onToggleRubric: (id: number) => void;
  onSetMainRubric: (id: number) => void;
  onCancelCreate: () => void;
  onSetTranslateTexts: (value: boolean) => void;
  onSetAutoDetectSourceLanguage: (value: boolean) => void;
  onSetConvertCurrency: (value: boolean) => void;
  onLoadDeliveryOptions: () => Promise<void>;
  onSetCreateForm: (updater: (prev: XLJVCreateFormState | null) => XLJVCreateFormState | null) => void;
  onCreateImageUpload: (files: FileList | null) => Promise<void>;
  onSendCreatedProduct: () => Promise<void>;
  onSendCreatedProductToAllSites: () => Promise<void>;
};

export type XLJVPanelResultsProps = {
  site: Site;
  allXlResult: XLAllSitesResult | null;
  selectedSiteKeys: string[];
  templateSiteKey: string;
  createOrderLoading: boolean;
  sendSelectedLoading: boolean;
  batchLanguageMapsAttempted: boolean;
  batchLanguageMaps: SiteLanguageMapPreview[];
  orderDraft: XLJVOrderDraft | null;
  item: XLJVResponse | null;
  onToggleSelectedSite: (siteKey: string) => void;
  onSetTemplateSiteKey: (siteKey: string) => void;
  onCreateOrder: () => void;
  onCreateOrderDraft: () => Promise<void>;
  onSendToSelectedSites: () => Promise<void>;
  onSetOrderDraft: (next: XLJVOrderDraft | null) => void;
};

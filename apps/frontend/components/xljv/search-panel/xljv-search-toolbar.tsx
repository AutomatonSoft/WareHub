import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLabels } from "@/app/use-labels";

import type { Site } from "../xljv-search-utils";

export function XLJVSearchToolbar(props: {
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
  translateTexts: boolean;
  autoDetectSourceLanguage: boolean;
  convertCurrency: boolean;
  onSearch: (event: React.FormEvent<HTMLFormElement>) => void;
  onSetEan: (value: string) => void;
  onSetSiteKey: (value: string) => void;
  onSetSite: (site: Site) => void;
  onSync: () => Promise<void>;
  onSearchAllSites: () => Promise<void>;
  onCreateProduct: () => Promise<void>;
  onCancelCreate: () => void;
  createForm: unknown | null;
  onSetTranslateTexts: (value: boolean) => void;
  onSetAutoDetectSourceLanguage: (value: boolean) => void;
  onSetConvertCurrency: (value: boolean) => void;
  labels: Record<string, string>;
}) {
  const { labels } = props;
  const t = useLabels();
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>{t.xljvSearchTitle}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <form className="grid gap-2 md:grid-cols-[1fr_200px_140px_auto_auto_auto]" onSubmit={props.onSearch}>
          <Input value={props.ean} onChange={(event) => props.onSetEan(event.target.value)} placeholder={t.ean} aria-label={t.ean} />
          <Select value={props.siteKey} onValueChange={(value) => props.onSetSiteKey(value ?? "")}>
            <SelectTrigger><SelectValue placeholder={t.siteKey} /></SelectTrigger>
            <SelectContent>
              {props.siteKeyOptions.map((option) => (
                <SelectItem key={option.value || "__auto"} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={props.site} onValueChange={(value) => props.onSetSite((value as "XL" | "JV") ?? "XL")} disabled={props.siteLocked}>
            <SelectTrigger><SelectValue placeholder={t.site} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="XL">XL</SelectItem>
              <SelectItem value="JV">JV</SelectItem>
            </SelectContent>
          </Select>
          <Button type="submit" disabled={props.loading}><Search />{props.loading ? labels.loading : labels.searchLabel}</Button>
          <Button type="button" variant="outline" onClick={() => void props.onSync()} disabled={props.syncLoading}>
            {props.syncLoading ? labels.syncing : labels.syncFromSource}
          </Button>
          <Button type="button" variant="outline" onClick={() => void props.onSearchAllSites()} disabled={props.allXlLoading}>
            {props.allXlLoading ? labels.searching : labels.searchAllSites}
          </Button>
        </form>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => void props.onCreateProduct()} disabled={props.createProductLoading || props.createProductSendLoading}>
            {props.createProductLoading ? labels.preparing : labels.create}
          </Button>
          {props.createForm ? <Button type="button" variant="ghost" onClick={props.onCancelCreate}>{labels.cancelShort}</Button> : null}
        </div>
        <div className="grid gap-2 text-sm md:grid-cols-3">
          <label className="inline-flex items-center gap-2"><Checkbox checked={props.translateTexts} onCheckedChange={(value) => props.onSetTranslateTexts(Boolean(value))} /><span>{labels.translateTexts}</span></label>
          <label className="inline-flex items-center gap-2"><Checkbox checked={props.autoDetectSourceLanguage} onCheckedChange={(value) => props.onSetAutoDetectSourceLanguage(Boolean(value))} disabled={!props.translateTexts} /><span>{labels.autoDetectSourceLanguage}</span></label>
          <label className="inline-flex items-center gap-2"><Checkbox checked={props.convertCurrency} onCheckedChange={(value) => props.onSetConvertCurrency(Boolean(value))} /><span>{labels.convertCurrency}</span></label>
        </div>
      </CardContent>
    </Card>
  );
}

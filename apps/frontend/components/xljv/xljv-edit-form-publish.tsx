"use client";

import { Dispatch, SetStateAction } from "react";
import { RotateCcw, Save, Send } from "lucide-react";
import { Button } from "../shared/button";
import { Card } from "../shared/card";
import { Checkbox } from "../shared/checkbox";
import { XLAllSitesResult } from "./xljv-edit-utils";
import { SectionHeader } from "./xljv-edit-form-shared";

export function SelectedSitesCard({
  t,
  allSitesResult,
  selectedSiteKeys,
  templateSiteKey,
  sitesLoading,
  batchSending,
  batchStatus,
  batchErrors,
  batchLanguageMapsAttempted,
  batchLanguageMapsLength,
  setTemplateSiteKey,
  onToggleSelectedSite,
  onLoadProductBySiteKey,
  onHandleLoadAllSites,
  onHandleSendToSelectedSites
}: {
  t: Record<string, string>;
  allSitesResult: XLAllSitesResult | null;
  selectedSiteKeys: string[];
  templateSiteKey: string;
  sitesLoading: boolean;
  batchSending: boolean;
  batchStatus: string | null;
  batchErrors: string[];
  batchLanguageMapsAttempted: boolean;
  batchLanguageMapsLength: number;
  setTemplateSiteKey: Dispatch<SetStateAction<string>>;
  onToggleSelectedSite: (siteKeyValue: string) => void;
  onLoadProductBySiteKey: (siteKeyValue: string) => Promise<void>;
  onHandleLoadAllSites: () => Promise<void>;
  onHandleSendToSelectedSites: () => Promise<void>;
}) {
  return (
    <Card className="rounded-xl p-5 shadow-sm">
      <SectionHeader title="Target Site Review" badge="Publish" description="Review template and target sites before pushing product updates." />
      <Button type="button" variant="secondary" onClick={() => void onHandleLoadAllSites()} disabled={sitesLoading}>
        {sitesLoading ? t.loadingSites : t.loadSites}
      </Button>
      {allSitesResult ? (
        <div className="mt-4 space-y-3">
          <div className="text-xs text-[color:var(--text-muted)]">
            {t.found}: {allSitesResult.found_count} | {t.missing}: {allSitesResult.missing_count}
          </div>
          <div className="overflow-auto rounded-xl border border-[color:var(--outline)]">
            <table className="w-full min-w-[660px] text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left">{t.use}</th>
                  <th className="px-3 py-2 text-left">{t.template}</th>
                  <th className="px-3 py-2 text-left">{t.site}</th>
                  <th className="px-3 py-2 text-left">{t.siteKey}</th>
                </tr>
              </thead>
              <tbody>
                {allSitesResult.found.map((row) => (
                  <tr key={`${row.site_key}-${row.product_id}`} className="border-t border-[color:var(--outline)]">
                    <td className="px-3 py-2">
                      <Checkbox checked={selectedSiteKeys.includes(row.site_key)} onChange={() => onToggleSelectedSite(row.site_key)} aria-label={`Use ${row.site_key}`} />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        className="ui-radio focus-ring"
                        type="radio"
                        name="template-site-edit"
                        checked={templateSiteKey === row.site_key}
                        onChange={() => {
                          setTemplateSiteKey(row.site_key);
                          void onLoadProductBySiteKey(row.site_key);
                        }}
                      />
                    </td>
                    <td className="px-3 py-2">{row.domain}</td>
                    <td className="px-3 py-2">{row.site_key}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button type="button" onClick={() => void onHandleSendToSelectedSites()} loading={batchSending}>
            {t.sendToSelectedSites}
          </Button>
        </div>
      ) : null}
      {batchStatus ? <div className="mt-3 text-sm text-emerald-700">{batchStatus}</div> : null}
      {batchErrors.length > 0 ? <div className="mt-3 whitespace-pre-line rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{batchErrors.join("\n")}</div> : null}
      {batchLanguageMapsAttempted && batchLanguageMapsLength === 0 ? <div className="mt-3 text-sm text-[color:var(--text-muted)]">{t.mappingNotReturned}</div> : null}
    </Card>
  );
}

export function ProductEditorActionBar({
  saving,
  batchSending,
  onReset,
  onSendToSelectedSites
}: {
  saving: boolean;
  batchSending: boolean;
  onReset: () => void;
  onSendToSelectedSites: () => Promise<void>;
}) {
  return (
    <Card className="rounded-xl border border-[color:var(--outline)] bg-white px-4 py-3 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs text-[color:var(--text-secondary)]">Review changes before publishing.</div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="ghost" className="h-10 whitespace-nowrap px-4" onClick={onReset}>
            <RotateCcw size={16} className="shrink-0" aria-hidden="true" />
            Reset Changes
          </Button>
          <Button type="submit" variant="secondary" className="h-10 whitespace-nowrap px-5" loading={saving}>
            <Save size={16} className="shrink-0" aria-hidden="true" />
            Save Draft
          </Button>
          <Button
            type="button"
            className="h-10 whitespace-nowrap px-5"
            loading={batchSending}
            onClick={() => void onSendToSelectedSites()}
          >
            <Send size={16} className="shrink-0" aria-hidden="true" />
            Update Selected Sites
          </Button>
        </div>
      </div>
    </Card>
  );
}


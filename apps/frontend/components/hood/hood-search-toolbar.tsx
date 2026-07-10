"use client";

import { FormEvent } from "react";
import { useLabels } from "../../app/use-labels";
import { Button } from "../shared/button";
import { Card } from "../shared/card";
import { FormField } from "../shared/form-field";
import { Input } from "../shared/input";
import { HoodAccount } from "./hood-search-utils";

type HoodSearchToolbarProps = {
  activeTab: "search" | "patch";
  ean: string;
  account: HoodAccount;
  loading: boolean;
  patchLoading: boolean;
  onSetActiveTab: (tab: "search" | "patch") => void;
  onSetEan: (ean: string) => void;
  onSetAccount: (account: HoodAccount) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function HoodSearchToolbar({
  activeTab,
  ean,
  account,
  loading,
  patchLoading,
  onSetActiveTab,
  onSetEan,
  onSetAccount,
  onSubmit
}: HoodSearchToolbarProps) {
  const t = useLabels();
  return (
    <Card className="space-y-4">
      <div className="ui-tabs w-fit">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "search"}
          onClick={() => onSetActiveTab("search")}
          className="ui-tab focus-ring"
        >
          {t.searchLabel}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "patch"}
          onClick={() => onSetActiveTab("patch")}
          className="ui-tab focus-ring"
        >
          {t.patchLabel}
        </button>
      </div>

      <form className="grid gap-3 md:grid-cols-[1fr_auto_auto]" onSubmit={onSubmit}>
        <FormField label={t.ean}>
          {(fieldProps) => (
            <Input
              {...fieldProps}
              placeholder={t.forExampleItemNumber}
              value={ean}
              onChange={(event) => onSetEan(event.target.value)}
            />
          )}
        </FormField>
        <FormField label={t.account}>
          {(fieldProps) => (
            <select
              {...fieldProps}
              className="ui-select h-11 rounded-full px-4 text-sm"
              value={account}
              onChange={(event) => onSetAccount(event.target.value === "jv" ? "jv" : "xl")}
            >
              <option value="xl">XL</option>
              <option value="jv">JV</option>
            </select>
          )}
        </FormField>
        <Button type="submit" loading={activeTab === "search" ? loading : patchLoading} className="self-end w-full md:w-auto">
          {activeTab === "search" ? t.find : t.patchLabel}
        </Button>
      </form>
    </Card>
  );
}

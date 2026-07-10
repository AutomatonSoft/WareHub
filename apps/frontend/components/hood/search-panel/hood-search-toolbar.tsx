"use client";

import { FormEvent } from "react";
import { useLabels } from "../../../app/use-labels";
import { HoodAccount } from "../hood-search-utils";
import { Button } from "../../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Input } from "../../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";

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

export function HoodSearchToolbar(props: HoodSearchToolbarProps) {
  const t = useLabels();
  const { activeTab, ean, account, loading, patchLoading, onSetActiveTab, onSetEan, onSetAccount, onSubmit } = props;

  return (
      <Card>
      <CardHeader>
        <CardTitle>{t.hoodWorkspace}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Button type="button" variant={activeTab === "search" ? "default" : "secondary"} onClick={() => onSetActiveTab("search")}>
            {t.searchLabel}
          </Button>
          <Button type="button" variant={activeTab === "patch" ? "default" : "secondary"} onClick={() => onSetActiveTab("patch")}>
            {t.patchLabel}
          </Button>
        </div>
        <form className="grid gap-3 md:grid-cols-[1fr_180px_auto]" onSubmit={onSubmit}>
          <Input id="hood-search-ean-input" placeholder={t.ean} value={ean} onChange={(event) => onSetEan(event.target.value)} />
          <Select value={account} onValueChange={(value) => value && onSetAccount(value === "jv" ? "jv" : "xl")}>
            <SelectTrigger id="hood-search-account-trigger" className="h-9 w-full">
              <SelectValue placeholder={t.account} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="xl">XL</SelectItem>
              <SelectItem value="jv">JV</SelectItem>
            </SelectContent>
          </Select>
          <Button type="submit" disabled={activeTab === "search" ? loading : patchLoading}>
            {activeTab === "search" ? (loading ? t.loading : t.find) : patchLoading ? t.loading : t.patchLabel}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}


"use client";

import { FormEvent } from "react";
import { useLabels } from "../../../app/use-labels";
import { Button } from "../../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Input } from "../../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";

type Props = {
  form: { ean: string; controller: "jv" | "xl" };
  loading: boolean;
  onSetForm: (updater: (prev: { ean: string; controller: "jv" | "xl" }) => { ean: string; controller: "jv" | "xl" }) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
};

export function KauflandDeleteCard({ form, loading, onSetForm, onSubmit }: Props) {
  const t = useLabels();
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">{t.kauflandDeleteByEanTitle}</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="grid gap-3 md:grid-cols-2" onSubmit={(event) => void onSubmit(event)}>
          <Input placeholder={t.ean} value={form.ean} onChange={(event) => onSetForm((prev) => ({ ...prev, ean: event.target.value }))} />
          <Select value={form.controller} onValueChange={(value) => value && onSetForm((prev) => ({ ...prev, controller: value as "jv" | "xl" }))}>
            <SelectTrigger className="h-9 w-full">
              <SelectValue placeholder={t.controller} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="xl">XL</SelectItem>
              <SelectItem value="jv">JV</SelectItem>
            </SelectContent>
          </Select>
          <div className="md:col-span-2">
            <Button type="submit" variant="destructive" disabled={loading}>{loading ? t.loading : t.kauflandDeleteProductAction}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}


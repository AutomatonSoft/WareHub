"use client";

import { FormEvent } from "react";
import { useLabels } from "../../../app/use-labels";
import { KauflandChangePayload } from "./kaufland-panel-types";
import { Button } from "../../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Input } from "../../ui/input";
import { KauflandProductFields } from "./kaufland-product-fields";

type Props = {
  form: KauflandChangePayload;
  loading: boolean;
  onSetForm: (updater: (prev: KauflandChangePayload) => KauflandChangePayload) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
};

export function KauflandUpdateCard({ form, loading, onSetForm, onSubmit }: Props) {
  const t = useLabels();
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">{t.updateProductByEan}</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="grid gap-3 md:grid-cols-2" onSubmit={(event) => void onSubmit(event)}>
          <Input placeholder={t.ean} value={form.ean} onChange={(event) => onSetForm((prev) => ({ ...prev, ean: event.target.value }))} />
          <Input placeholder={t.controller} value={form.controller} onChange={(event) => onSetForm((prev) => ({ ...prev, controller: event.target.value as "jv" | "xl" }))} />
          <KauflandProductFields form={form} onSetForm={onSetForm} />
          <div className="md:col-span-2">
            <Button type="submit" disabled={loading}>{loading ? t.loading : t.sendUpdate}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

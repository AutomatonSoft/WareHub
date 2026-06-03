"use client";

import { FormEvent } from "react";
import { useLabels } from "../../../app/use-labels";
import { KauflandChangePayload } from "./kaufland-panel-types";
import { Button } from "../../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Input } from "../../ui/input";
import { Textarea } from "../../ui/textarea";

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
          <Input placeholder="EAN" value={form.ean} onChange={(event) => onSetForm((prev) => ({ ...prev, ean: event.target.value }))} />
          <Input placeholder={t.controller} value={form.controller} onChange={(event) => onSetForm((prev) => ({ ...prev, controller: event.target.value }))} />
          <Input className="md:col-span-2" placeholder={t.title} value={form.title} onChange={(event) => onSetForm((prev) => ({ ...prev, title: event.target.value }))} />
          <Textarea className="min-h-[120px] bg-muted/30 md:col-span-2" placeholder={t.description} value={form.description} onChange={(event) => onSetForm((prev) => ({ ...prev, description: event.target.value }))} />
          <Textarea className="min-h-[90px] bg-muted/30 md:col-span-2" placeholder={t.pictureUrlsJsonArray} value={form.picture_urls} onChange={(event) => onSetForm((prev) => ({ ...prev, picture_urls: event.target.value }))} />
          <Input placeholder={t.unitId} value={form.unit_id} onChange={(event) => onSetForm((prev) => ({ ...prev, unit_id: event.target.value }))} />
          <Input placeholder={t.storefront} value={form.storefront} onChange={(event) => onSetForm((prev) => ({ ...prev, storefront: event.target.value }))} />
          <Input placeholder="Price" value={form.price} onChange={(event) => onSetForm((prev) => ({ ...prev, price: event.target.value }))} />
          <div className="md:col-span-2">
            <Button type="submit" disabled={loading}>{loading ? t.loading : t.sendUpdate}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}


"use client";

import { FormEvent } from "react";
import { useLabels } from "../../../app/use-labels";
import { KauflandCreatePayload } from "./kaufland-panel-types";
import { Button } from "../../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Input } from "../../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { Textarea } from "../../ui/textarea";

type Props = {
  form: KauflandCreatePayload;
  loading: boolean;
  onSetForm: (updater: (prev: KauflandCreatePayload) => KauflandCreatePayload) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
};

export function KauflandCreateCard({ form, loading, onSetForm, onSubmit }: Props) {
  const t = useLabels();
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Create product by EAN</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="grid gap-3 md:grid-cols-2" onSubmit={(event) => void onSubmit(event)}>
          <Input placeholder="EAN" value={form.ean} onChange={(event) => onSetForm((prev) => ({ ...prev, ean: event.target.value }))} />
          <Select value={form.controller} onValueChange={(value) => value && onSetForm((prev) => ({ ...prev, controller: value as "jv" | "xl" }))}>
            <SelectTrigger className="h-9 w-full">
              <SelectValue placeholder={t.controller} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="xl">XL</SelectItem>
              <SelectItem value="jv">JV</SelectItem>
            </SelectContent>
          </Select>
          <Input className="md:col-span-2" placeholder={t.title} value={form.title} onChange={(event) => onSetForm((prev) => ({ ...prev, title: event.target.value }))} />
          <Textarea className="min-h-[120px] bg-muted/30 md:col-span-2" placeholder={`${t.description} (required)`} value={form.description} onChange={(event) => onSetForm((prev) => ({ ...prev, description: event.target.value }))} />
          <Textarea className="min-h-[90px] bg-muted/30 md:col-span-2" placeholder="Picture JSON array (required)" value={form.picture} onChange={(event) => onSetForm((prev) => ({ ...prev, picture: event.target.value }))} />
          <Input placeholder="Price (required)" value={form.price} onChange={(event) => onSetForm((prev) => ({ ...prev, price: event.target.value }))} />
          <Input placeholder="Size (required)" value={form.size} onChange={(event) => onSetForm((prev) => ({ ...prev, size: event.target.value }))} />
          <Input placeholder="Color (required)" value={form.color} onChange={(event) => onSetForm((prev) => ({ ...prev, color: event.target.value }))} />
          <Input placeholder="Material (required)" value={form.material} onChange={(event) => onSetForm((prev) => ({ ...prev, material: event.target.value }))} />
          <Input placeholder="Delivery (required integer)" value={form.delivery} onChange={(event) => onSetForm((prev) => ({ ...prev, delivery: event.target.value }))} />
          <Input placeholder="Height (required integer)" value={form.height} onChange={(event) => onSetForm((prev) => ({ ...prev, height: event.target.value }))} />
          <Input placeholder="Length (required integer)" value={form.length} onChange={(event) => onSetForm((prev) => ({ ...prev, length: event.target.value }))} />
          <Input placeholder="Width (required integer)" value={form.width} onChange={(event) => onSetForm((prev) => ({ ...prev, width: event.target.value }))} />
          <div className="md:col-span-2">
            <Button type="submit" disabled={loading}>{loading ? t.loading : "Create product"}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}


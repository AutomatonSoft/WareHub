"use client";

import { FormEvent } from "react";
import { Search } from "lucide-react";
import { useLabels } from "../../../app/use-labels";
import { KauflandSite } from "../kaufland-api";
import { Button } from "../../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../ui/card";
import { Input } from "../../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";

type Props = {
  ean: string;
  site: KauflandSite;
  loading: boolean;
  onSetEan: (value: string) => void;
  onSetSite: (value: KauflandSite) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
};

export function KauflandSearchCard(props: Props) {
  const t = useLabels();
  const { ean, site, loading, onSetEan, onSetSite, onSubmit } = props;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>{t.kauflandSearchTitle}</CardTitle>
        <CardDescription>{t.kauflandSearchDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-3 md:grid-cols-[1fr_180px_auto]" onSubmit={(event) => void onSubmit(event)}>
          <Input placeholder={t.kauflandEanExamplePlaceholder} value={ean} onChange={(event) => onSetEan(event.target.value)} />
          <Select value={site} onValueChange={(value) => value && onSetSite(value as KauflandSite)}>
            <SelectTrigger className="h-9 w-full">
              <SelectValue placeholder={t.site} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="xl">XL</SelectItem>
              <SelectItem value="jv">JV</SelectItem>
            </SelectContent>
          </Select>
          <Button type="submit" disabled={loading} className="self-end">
            <Search size={14} className="mr-1" />
            {loading ? t.loading : t.findInKaufland}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}


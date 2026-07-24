"use client";

import { Building2Icon, CheckCircle2Icon, Globe2Icon, StoreIcon } from "lucide-react";

import { Button } from "../../components/ui/button";
import { Checkbox } from "../../components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { cn } from "../../lib/utils";

export type PublishSiteOption = {
  id: string;
  label: string;
  family: "JVMOEBEL" | "XL" | "HOOD" | "KAUFLAND";
};

type PublishSitesDialogProps = {
  open: boolean;
  title: string;
  sites: PublishSiteOption[];
  selectedSiteIds: Set<string>;
  onOpenChange: (open: boolean) => void;
  onSelectedSiteIdsChange: (siteIds: Set<string>) => void;
  onConfirm: () => void;
};

const iconByFamily = {
  JVMOEBEL: Building2Icon,
  XL: Globe2Icon,
  HOOD: StoreIcon,
  KAUFLAND: StoreIcon,
} as const;

export function PublishSitesDialog({ open, title, sites, selectedSiteIds, onOpenChange, onSelectedSiteIdsChange, onConfirm }: PublishSitesDialogProps) {
  const toggleSite = (siteId: string) => {
    const next = new Set(selectedSiteIds);
    if (next.has(siteId)) next.delete(siteId);
    else next.add(siteId);
    onSelectedSiteIdsChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Выберите сайты для публикации</DialogTitle>
          <DialogDescription>{title}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {sites.map((site) => {
            const Icon = iconByFamily[site.family];
            const isSelected = selectedSiteIds.has(site.id);

            return (
              <label key={site.id} className={cn("group flex cursor-pointer items-center gap-3 rounded-[var(--radius-control)] border p-3 transition-colors duration-200", isSelected ? "border-primary bg-primary/5" : "border-border/70 bg-background hover:bg-muted/40")}>
                <Checkbox checked={isSelected} onCheckedChange={() => toggleSite(site.id)} />
                <span className={cn("flex size-9 items-center justify-center rounded-[var(--radius-control)]", isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                  <Icon />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm font-semibold text-foreground">{site.label}</span>
                  <span className="text-xs text-muted-foreground">{site.family === "JVMOEBEL" ? "JV Möbel" : site.family}</span>
                </span>
                {isSelected ? <CheckCircle2Icon className="text-primary" aria-label="Выбрано" /> : null}
              </label>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button disabled={selectedSiteIds.size === 0} onClick={onConfirm}>Создать и опубликовать</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

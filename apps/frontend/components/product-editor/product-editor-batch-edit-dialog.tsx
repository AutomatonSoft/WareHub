"use client";

import { useEffect, useMemo, useState } from "react";

import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";

export type ProductEditorBatchEditSite = {
  tabKey: string;
  label: string;
  targetIds: string[];
  targetLabels: string[];
  changedFieldsCount: number;
};

export type ProductEditorBatchEditResult = {
  targetId: string;
  label: string;
  status: "success" | "failed";
  errorMessage?: string;
};

export function ProductEditorBatchEditDialog({
  open,
  sites,
  results,
  loading,
  onOpenChange,
  onApply,
}: {
  open: boolean;
  sites: ProductEditorBatchEditSite[];
  results: ProductEditorBatchEditResult[];
  loading: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (tabKeys: string[]) => void;
}) {
  const [selectedTabKeys, setSelectedTabKeys] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (open) setSelectedTabKeys(new Set(sites.map((site) => site.tabKey)));
  }, [open, sites]);

  const successfulCount = results.filter((result) => result.status === "success").length;
  const failedCount = results.filter((result) => result.status === "failed").length;
  const selectedCount = selectedTabKeys.size;
  const resultByTargetId = useMemo(
    () => new Map(results.map((result) => [result.targetId, result])),
    [results],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] max-w-xl overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit product on selected sites</DialogTitle>
          <DialogDescription>
            Select the sites that should receive the edited product data. Only found sites with unsaved changes are listed.
          </DialogDescription>
        </DialogHeader>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-xs font-medium text-foreground">Sites to update</legend>
          {sites.map((site) => {
            const result = site.targetIds
              .map((targetId) => resultByTargetId.get(targetId))
              .find(Boolean);
            const checked = selectedTabKeys.has(site.tabKey);
            return (
              <label
                key={site.tabKey}
                className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-control)] border border-border/70 p-3 transition-colors hover:bg-muted/50"
              >
                <Checkbox
                  checked={checked}
                  disabled={loading}
                  onCheckedChange={(nextChecked) => {
                    setSelectedTabKeys((current) => {
                      const next = new Set(current);
                      if (nextChecked) next.add(site.tabKey);
                      else next.delete(site.tabKey);
                      return next;
                    });
                  }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-foreground">{site.label}</span>
                  <span className="block text-xs text-muted-foreground">
                    {site.targetLabels.join(", ") || "Found site"} · {site.changedFieldsCount} changed field{site.changedFieldsCount === 1 ? "" : "s"}
                  </span>
                </span>
                {result ? (
                  <Badge variant={result.status === "success" ? "default" : "destructive"}>
                    {result.status === "success" ? "Updated" : "Failed"}
                  </Badge>
                ) : null}
              </label>
            );
          })}
        </fieldset>

        {results.length > 0 ? (
          <div className="flex flex-col gap-2 rounded-[var(--radius-control)] bg-muted/50 p-3 text-xs text-muted-foreground">
            <div className="flex flex-wrap gap-2">
              <span>Total: {results.length}</span>
              <span>Updated: {successfulCount}</span>
              <span>Failed: {failedCount}</span>
            </div>
            {results.map((result) => (
              <div key={result.targetId} className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate">{result.label}{result.errorMessage ? ` — ${result.errorMessage}` : ""}</span>
                <Badge variant={result.status === "success" ? "default" : "destructive"}>
                  {result.status === "success" ? "Updated" : "Failed"}
                </Badge>
              </div>
            ))}
          </div>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" disabled={loading} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={loading || selectedCount === 0} onClick={() => onApply([...selectedTabKeys])}>
            {loading ? "Updating…" : `Edit selected sites (${selectedCount})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

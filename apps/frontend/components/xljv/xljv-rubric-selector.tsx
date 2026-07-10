"use client";

import { useMemo } from "react";
import { useLabels } from "../../app/use-labels";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";
import { RubricTreeNode, Site } from "./xljv-search-utils";

type XLJVRubricSelectorProps = {
  site: Site;
  rubricsLoading: boolean;
  rubrics: RubricTreeNode[];
  selectedRubricIds: number[];
  mainRubricId: number | null;
  onLoadRubrics: () => Promise<void>;
  onToggleRubric: (id: number) => void;
  onSetMainRubric: (id: number) => void;
};

export function XLJVRubricSelector(props: XLJVRubricSelectorProps) {
  const t = useLabels();
  const rubricsTree = useMemo(() => {
    const byParent = new Map<number, RubricTreeNode[]>();
    for (const node of props.rubrics) {
      const parent = Number(node.parent_id || 0);
      const list = byParent.get(parent) || [];
      list.push(node);
      byParent.set(parent, list);
    }
    for (const list of byParent.values()) {
      list.sort((a, b) => {
        const sa = Number(a.sort_order || 0);
        const sb = Number(b.sort_order || 0);
        if (sa !== sb) return sa - sb;
        return Number(a.id) - Number(b.id);
      });
    }
    const build = (parentId: number): RubricTreeNode[] =>
      (byParent.get(parentId) || []).map((node) => ({
        ...node,
        children: build(Number(node.id))
      }));
    return build(0);
  }, [props.rubrics]);

  function renderRubricNode(node: RubricTreeNode, level = 0) {
    const checked = props.selectedRubricIds.includes(node.id);
    return (
      <div key={node.id}>
        <label
          className="mb-1 flex items-center gap-2"
          style={{ paddingLeft: `${level * 18}px` }}
          title={node.rubnum || node.name}
        >
          <span className="inline-block w-3 text-[11px]">{node.children?.length ? "??" : "?"}</span>
          <input type="checkbox" checked={checked} onChange={() => props.onToggleRubric(node.id)} />
          <span className="truncate">{node.name}</span>
          <span className="text-[10px] text-[color:var(--text-muted)]">({node.id})</span>
        </label>
        {node.children?.length ? node.children.map((child) => renderRubricNode(child, level + 1)) : null}
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-border bg-muted/30 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold">{props.site === "JV" ? t.xljvJvRubrics : t.xljvXlCategories}</span>
        <Button type="button" variant="ghost" onClick={() => void props.onLoadRubrics()} disabled={props.rubricsLoading}>
          {props.rubricsLoading ? t.loading : t.xljvLoadCategories}
        </Button>
      </div>
      <ScrollArea className="h-44 rounded-xl border border-border p-2 text-xs">
        {props.rubrics.length === 0 ? (
          <div className="text-[color:var(--text-muted)]">{t.xljvNoRubricsLoaded}</div>
        ) : (
          rubricsTree.map((node) => renderRubricNode(node, 0))
        )}
      </ScrollArea>
      {props.selectedRubricIds.length > 0 ? (
        <div className="mt-2">
          <div className="mb-1 text-xs font-semibold">{t.xljvMainRubric}</div>
          <select
            className="ui-select w-full rounded-xl border border-border bg-card px-2 py-2 text-xs"
            value={props.mainRubricId ?? props.selectedRubricIds[0]}
            onChange={(event) => props.onSetMainRubric(Number(event.target.value))}
          >
            {props.selectedRubricIds.map((id) => {
              const rubric = props.rubrics.find((x) => x.id === id);
              return (
                <option key={id} value={id}>
                  {(rubric?.name || t.xljvRubricFallbackName)} ({id})
                </option>
              );
            })}
          </select>
        </div>
      ) : null}
    </div>
  );
}

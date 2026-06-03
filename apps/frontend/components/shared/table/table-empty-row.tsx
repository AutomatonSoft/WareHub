"use client";

import { useLabels } from "../../../app/use-labels";
import { EmptyState } from "../empty-state";

type TableEmptyRowProps = {
  colSpan: number;
  message?: string | null;
  title?: string;
  actionLabel?: string;
  onAction?: () => void;
  variant?: "default" | "inventory" | "sofort" | "marketplace";
};

export function TableEmptyRow({ colSpan, message, title, actionLabel, onAction, variant = "default" }: TableEmptyRowProps) {
  const t = useLabels();
  return (
    <tr>
      <td className="ui-table-empty" colSpan={colSpan}>
        <div className="mx-auto max-w-md py-1">
          <EmptyState
            compact
            variant={variant}
            title={title || t.noDataFound}
            message={message || t.noDataFound}
            actionLabel={actionLabel}
            onAction={onAction}
          />
        </div>
      </td>
    </tr>
  );
}

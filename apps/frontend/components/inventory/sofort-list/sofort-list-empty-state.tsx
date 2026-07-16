import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useLabels } from "@/app/use-labels";

export function SofortListEmptyState({ clearLabel, onReset }: { clearLabel: string; onReset: () => void }) {
  const t = useLabels();

  return (
    <EmptyState
      title={t.noSofortRowsFound}
      description={t.noRowsMatchCurrentFilters}
      className="wh-sofort-empty-state"
    >
      <Button type="button" variant="outline" onClick={onReset}>
        {clearLabel}
      </Button>
    </EmptyState>
  );
}

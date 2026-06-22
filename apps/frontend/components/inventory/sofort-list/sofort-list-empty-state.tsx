import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export function SofortListEmptyState({ clearLabel, onReset }: { clearLabel: string; onReset: () => void }) {
  return (
    <EmptyState title="No sofort rows found" description="No rows match your current filters." className="min-h-32 border-0 bg-transparent shadow-none">
      <Button type="button" variant="outline" onClick={onReset}>
        {clearLabel}
      </Button>
    </EmptyState>
  );
}

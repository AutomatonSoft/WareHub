import { Plus, RefreshCcw, WandSparkles } from "lucide-react";
import { useLabels } from "../../app/use-labels";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";

export function QuickActionsCard() {
  const t = useLabels();

  return (
    <Card className="wh-section-card wh-dashboard__actions-card wh-dashboard__quick-actions min-w-0">
      <CardHeader className="wh-section-card__header wh-dashboard__compact-header">
        <div className="min-w-0">
          <CardTitle className="title-with-icon wh-section-card__title whitespace-nowrap">
            <span className="title-icon-chip"><WandSparkles size={14} /></span>
            {t.quickActions}
          </CardTitle>
          <CardDescription className="wh-section-card__subtitle">
            Run common operations quickly
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="wh-section-card__body">
        <div className="wh-quick-actions__grid">
          <Button className="wh-dashboard-action-button wh-button--primary w-full justify-start">
            <Plus data-icon="inline-start" />
            {t.newIntakeBatch}
          </Button>
          <Button className="wh-dashboard-action-button wh-button--secondary w-full justify-start" variant="secondary">
            <WandSparkles data-icon="inline-start" />
            {t.generateRestockPlan}
          </Button>
          <Button className="wh-dashboard-action-button wh-button--secondary w-full justify-start" variant="secondary">
            <RefreshCcw data-icon="inline-start" />
            {t.pushAllPendingSync}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

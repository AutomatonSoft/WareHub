import { Card } from "../components/shared/card";

export default {
  title: "Shared/Card",
  component: Card
};

export function BasicCard() {
  return (
    <Card className="max-w-[420px]">
      <h3 className="m-0 text-lg">Inventory Summary</h3>
      <p className="mt-2 text-sm text-[color:var(--text-secondary)]">Compact surface card with shared project styling.</p>
    </Card>
  );
}

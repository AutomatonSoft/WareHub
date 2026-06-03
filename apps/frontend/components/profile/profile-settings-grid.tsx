import { Card } from "../shared/card";

const cards = [
  {
    title: "Notification Settings",
    body: "Warehouse alerts, sync incidents, and payout anomalies"
  },
  {
    title: "API Tokens",
    body: "3 active keys, rotate every 30 days"
  },
  {
    title: "Integration Permissions",
    body: "Amazon and eBay set to elevated scope"
  },
  {
    title: "Security History",
    body: "14 successful logins, 0 suspicious attempts"
  }
];

export function ProfileSettingsGrid() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {cards.map((card) => (
        <Card key={card.title}>
          <h3 className="page-title text-lg">{card.title}</h3>
          <p className="mt-2 text-sm text-[color:var(--text-secondary)]">{card.body}</p>
          <button className="mt-3 text-xs font-semibold uppercase tracking-[0.08em] text-[color:var(--primary)]">
            Configure
          </button>
        </Card>
      ))}
    </div>
  );
}

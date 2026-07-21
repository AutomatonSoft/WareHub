import { Card } from "../shared/card";
import { useLabels } from "../../app/use-labels";

export function ProfileSettingsGrid() {
  const t = useLabels();
  const cards = [
    {
      title: t.profileSettingsNotificationsTitle,
      body: t.profileSettingsNotificationsBody
    },
    {
      title: t.profileSettingsApiTokensTitle,
      body: t.profileSettingsApiTokensBody
    },
    {
      title: t.profileSettingsPermissionsTitle,
      body: t.profileSettingsPermissionsBody
    },
    {
      title: t.profileSettingsSecurityHistoryTitle,
      body: t.profileSettingsSecurityHistoryBody
    }
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {cards.map((card) => (
        <Card key={card.title}>
          <h3 className="page-title text-lg">{card.title}</h3>
          <p className="mt-2 text-sm text-[color:var(--text-secondary)]">{card.body}</p>
          <button className="mt-3 text-xs font-semibold uppercase tracking-[0.08em] text-[color:var(--primary)]">
            {t.configure}
          </button>
        </Card>
      ))}
    </div>
  );
}

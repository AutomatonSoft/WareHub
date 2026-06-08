import { ShieldCheck } from "lucide-react";
import { useLabels } from "../../app/use-labels";
import { permissionRows } from "../../lib/mock-data";
import { Button } from "../shared/button";
import { Card } from "../shared/card";

export function ProfileOverviewCard() {
  const t = useLabels();
  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-xl bg-[linear-gradient(135deg,rgba(16,185,129,0.35),rgba(13,148,136,0.26))]" />
          <div>
            <h3 className="page-title text-xl">Maksim Rudinov</h3>
            <p className="text-sm text-[color:var(--text-secondary)]">{t.headOfOperationsWarehubEurope}</p>
            <p className="mt-1 text-xs text-[color:var(--text-muted)]">{t.workspaceAccessTeams}</p>
          </div>
        </div>
        <Button>{t.editProfile}</Button>
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        {permissionRows.map((row) => (
          <div key={row.scope} className="rounded-xl border border-border bg-muted/30 p-3">
            <p className="text-xs uppercase tracking-[0.08em] text-[color:var(--text-muted)]">{row.scope}</p>
            <p className="mt-1 text-sm font-semibold text-[color:var(--text-primary)]">{row.access}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-2 text-xs text-[color:var(--text-muted)]">
        <ShieldCheck size={14} className="text-[color:var(--success)]" />
        {t.mfaEnabledLastSignIn}
      </div>
    </Card>
  );
}


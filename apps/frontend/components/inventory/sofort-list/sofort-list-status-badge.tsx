import { Badge } from "@/components/ui/badge";

export function SofortListStatusBadge({
  listed,
  listedLabel,
  unlistedLabel
}: {
  listed: boolean;
  listedLabel: string;
  unlistedLabel: string;
}) {
  const className = listed
    ? "wh-status-badge wh-status-badge--success"
    : "wh-status-badge wh-status-badge--neutral";

  return (
    <Badge variant={listed ? "secondary" : "outline"} className={className}>
      {listed ? listedLabel : unlistedLabel}
    </Badge>
  );
}

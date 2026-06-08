import { AppShell } from "../../components/layout/app-shell";
import { ProfileAccountPanel } from "../../components/profile/profile-account-panel";
import { Card, CardContent } from "../../components/ui/card";

export default function ProfilePage() {
  return (
    <AppShell
      title="Profile"
      subtitle="User workspace, permissions, security posture, and platform appearance settings"
    >
      <Card className="rounded-xl border-border bg-card shadow-sm">
        <CardContent className="pt-4">
          <ProfileAccountPanel />
        </CardContent>
      </Card>
    </AppShell>
  );
}

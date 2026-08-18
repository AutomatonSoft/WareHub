import { AppShell } from "../../components/layout/app-shell";
import { OrchestratorTaskStatusPanel } from "../../components/tasks/orchestrator-task-status-panel";

export default function TaskStatusesPage() {
  return (
    <AppShell titleKey="taskStatusesTitle" subtitleKey="taskStatusesSubtitle">
      <OrchestratorTaskStatusPanel />
    </AppShell>
  );
}

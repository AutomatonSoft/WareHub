import type { IntakeGroup } from "./types";

export type DeleteGroupResult =
  | { ok: true; deletedIds: string[] }
  | { ok: false; status?: number };

export async function deleteIntakeGroup(params: {
  apiBase: string;
  token: string;
  group: IntakeGroup;
  onUnauthorized: () => void;
}): Promise<DeleteGroupResult> {
  const { apiBase, token, group, onUnauthorized } = params;
  const uniqueIds = Array.from(new Set(group.partIds));
  for (const id of uniqueIds) {
    const response = await fetch(`${apiBase}/intakes/${id}?mode=hard`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) {
      if (response.status === 401) {
        onUnauthorized();
      }
      return { ok: false, status: response.status };
    }
  }
  return { ok: true, deletedIds: uniqueIds };
}

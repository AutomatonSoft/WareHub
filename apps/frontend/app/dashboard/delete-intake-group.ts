import type { IntakeGroup } from "./types";
import { API_V1_ROUTES, buildApiV1Url } from "../api-v1-routes";
import { authorizedFetch } from "../client-api-shared";

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
    const response = await authorizedFetch(`${buildApiV1Url(apiBase, API_V1_ROUTES.intakes.byId(id))}?mode=hard`, {
      method: "DELETE",
    }, { apiBase, token });
    if (!response.ok) {
      if (response.status === 401) {
        onUnauthorized();
      }
      return { ok: false, status: response.status };
    }
  }
  return { ok: true, deletedIds: uniqueIds };
}

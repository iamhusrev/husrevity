import apiClient from "./api-client";
import { ApiResponse } from "@/types/common/api-response";
import { TrashListParams, TrashListResponse } from "@/types/trash/trash";
import { TRASH_ENDPOINTS } from "@/utils/api-endpoints";

/**
 * The API reads `kind` as a repeatable parameter (`kind=task&kind=project`), which axios'
 * default serializer would write as `kind[]=…`, so the query is built by hand.
 */
function toQuery({ kinds, since, limit, cursor }: TrashListParams): URLSearchParams {
  const query = new URLSearchParams();
  for (const kind of kinds ?? []) query.append("kind", kind);
  if (since) query.set("since", since);
  if (limit !== undefined) query.set("limit", String(limit));
  if (cursor) query.set("cursor", cursor);
  return query;
}

export const trashService = {
  async listDeleted(params: TrashListParams): Promise<ApiResponse<TrashListResponse>> {
    const res = await apiClient.get(TRASH_ENDPOINTS.LIST, { params: toQuery(params) });
    return res.data;
  },

  /**
   * Restores one entry; `restorePath` comes from the listing (e.g. `/tasks/12/restore`). Axios
   * ignores its baseURL for absolute and protocol-relative URLs and would send the Bearer token
   * there, so only a single-slash app path is accepted.
   */
  async restore(restorePath: string): Promise<ApiResponse<unknown>> {
    if (!/^\/(?![/\\])/.test(restorePath)) {
      throw new Error(`Invalid restore path: ${JSON.stringify(restorePath)}`);
    }
    const res = await apiClient.patch(restorePath);
    return res.data;
  },
};

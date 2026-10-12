import { AxiosError } from "axios";
import apiClient from "./api-client";
import { ApiResponse } from "@/types/common/api-response";
import {
  CompleteItemRequest,
  ItemListFilter,
  ItemRequest,
  ItemResponse,
  ParsedQuickAddDraft,
} from "@/types/item/item";
import { ITEM_ENDPOINTS } from "@/utils/api-endpoints";

export const itemService = {
  async listItems(filter?: ItemListFilter): Promise<ApiResponse<ItemResponse[]>> {
    const res = await apiClient.get(ITEM_ENDPOINTS.ITEMS, { params: filter });
    return res.data;
  },

  async getItem(id: string): Promise<ApiResponse<ItemResponse>> {
    const res = await apiClient.get(ITEM_ENDPOINTS.ITEM_BY_ID(id));
    return res.data;
  },

  async createItem(body: ItemRequest): Promise<ApiResponse<ItemResponse>> {
    const res = await apiClient.post(ITEM_ENDPOINTS.ITEMS, body);
    return res.data;
  },

  async updateItem(id: string, body: Partial<ItemRequest>): Promise<ApiResponse<ItemResponse>> {
    const res = await apiClient.patch(ITEM_ENDPOINTS.ITEM_BY_ID(id), body);
    return res.data;
  },

  async deleteItem(id: string): Promise<ApiResponse<void>> {
    const res = await apiClient.delete(ITEM_ENDPOINTS.ITEM_BY_ID(id));
    return res.data;
  },

  async completeItem(id: string, body: CompleteItemRequest): Promise<ApiResponse<ItemResponse>> {
    const res = await apiClient.post(ITEM_ENDPOINTS.ITEM_COMPLETE(id), body);
    return res.data;
  },

  async parseQuickAdd(text: string): Promise<ApiResponse<ParsedQuickAddDraft>> {
    const res = await apiClient.post(ITEM_ENDPOINTS.PARSE_QUICK_ADD, { text });
    return res.data;
  },
};

export interface IcsExportParams {
  /** YYYY-MM-DD, an Europe/Istanbul calendar day. */
  from: string;
  /** YYYY-MM-DD, inclusive. */
  to: string;
  includeTasks: boolean;
}

export interface IcsExportResult {
  blob: Blob;
  filename: string;
}

const SAFE_ICS_FILENAME = /^[A-Za-z0-9._-]+\.ics$/;

function filenameFromDisposition(header: unknown): string | null {
  if (typeof header !== "string") return null;
  const match = /filename="?([^";]+)"?/i.exec(header);
  const name = match?.[1]?.trim();
  return name && SAFE_ICS_FILENAME.test(name) ? name : null;
}

function readBlobText(blob: Blob): Promise<string> {
  if (typeof blob.text === "function") return blob.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

/**
 * With `responseType: "blob"` an error body arrives as a Blob too. When it holds the JSON
 * envelope, swap the parsed object in so the shared error parsing sees the server message.
 */
async function unwrapBlobError(error: unknown): Promise<unknown> {
  if (!(error instanceof AxiosError) || !(error.response?.data instanceof Blob)) return error;
  try {
    const parsed: unknown = JSON.parse(await readBlobText(error.response.data));
    if (parsed && typeof parsed === "object") error.response.data = parsed;
  } catch {
    // Not JSON: keep the Blob, the generic error message applies.
  }
  return error;
}

/**
 * Downloads the calendar as raw text/calendar (the endpoint has no JSON envelope).
 * The JWT header comes from the shared axios client.
 */
export async function exportItemsIcs(params: IcsExportParams): Promise<IcsExportResult> {
  let res;
  try {
    res = await apiClient.get(ITEM_ENDPOINTS.EXPORT_ICS, {
      params: { from: params.from, to: params.to, includeTasks: params.includeTasks },
      responseType: "blob",
    });
  } catch (error) {
    throw await unwrapBlobError(error);
  }
  const filename =
    filenameFromDisposition(res.headers?.["content-disposition"]) ??
    `husrevity-${params.from}_${params.to}.ics`;
  return { blob: res.data as Blob, filename };
}

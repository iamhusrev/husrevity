import apiClient from "./api-client";
import { ApiResponse } from "@/types/common/api-response";
import {
  VaultEntityRequest,
  VaultEntityResponse,
  VaultItemRequest,
  VaultItemResponse,
  VaultItemUpdateRequest,
} from "@/types/vault/vault";
import { VAULT_ENDPOINTS } from "@/utils/api-endpoints";

export const vaultService = {
  // ─── Entities ───────────────────────────────────────────────────────────────

  async listEntities(): Promise<ApiResponse<VaultEntityResponse[]>> {
    const res = await apiClient.get(VAULT_ENDPOINTS.ENTITIES);
    return res.data;
  },

  async createEntity(body: VaultEntityRequest): Promise<ApiResponse<VaultEntityResponse>> {
    const res = await apiClient.post(VAULT_ENDPOINTS.ENTITIES, body);
    return res.data;
  },

  async updateEntity(
    id: number,
    body: VaultEntityRequest,
  ): Promise<ApiResponse<VaultEntityResponse>> {
    const res = await apiClient.put(VAULT_ENDPOINTS.ENTITY_BY_ID(id), body);
    return res.data;
  },

  async deleteEntity(id: number): Promise<ApiResponse<void>> {
    const res = await apiClient.delete(VAULT_ENDPOINTS.ENTITY_BY_ID(id));
    return res.data;
  },

  // ─── Items ──────────────────────────────────────────────────────────────────

  async listItems(entityId: number): Promise<ApiResponse<VaultItemResponse[]>> {
    const res = await apiClient.get(VAULT_ENDPOINTS.ENTITY_ITEMS(entityId));
    return res.data;
  },

  async createItem(
    entityId: number,
    body: VaultItemRequest,
  ): Promise<ApiResponse<VaultItemResponse>> {
    const res = await apiClient.post(VAULT_ENDPOINTS.ENTITY_ITEMS(entityId), body);
    return res.data;
  },

  async updateItem(
    itemId: number,
    body: VaultItemUpdateRequest,
  ): Promise<ApiResponse<VaultItemResponse>> {
    const res = await apiClient.put(VAULT_ENDPOINTS.ITEM_BY_ID(itemId), body);
    return res.data;
  },

  async deleteItem(itemId: number): Promise<ApiResponse<void>> {
    const res = await apiClient.delete(VAULT_ENDPOINTS.ITEM_BY_ID(itemId));
    return res.data;
  },

  // ─── Import / Export ────────────────────────────────────────────────────────

  async importEnv(entityId: number, rawEnv: string): Promise<ApiResponse<VaultItemResponse[]>> {
    const res = await apiClient.post(VAULT_ENDPOINTS.ENTITY_IMPORT(entityId), rawEnv, {
      headers: { "Content-Type": "text/plain" },
    });
    return res.data;
  },

  async exportEnv(entityId: number): Promise<string> {
    const res = await apiClient.get(VAULT_ENDPOINTS.ENTITY_EXPORT(entityId), {
      responseType: "text",
    });
    return res.data;
  },
};

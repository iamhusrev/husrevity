import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { vaultService } from "@/services/vault-service";
import { VaultEntityRequest, VaultItemRequest, VaultItemUpdateRequest } from "@/types/vault/vault";

const KEYS = {
  entities: ["vault-entities"] as const,
  items: (entityId: number) => ["vault-items", entityId] as const,
};

// ─── Entities ─────────────────────────────────────────────────────────────────

export function useVaultEntities() {
  return useQuery({
    queryKey: KEYS.entities,
    queryFn: () => vaultService.listEntities(),
    select: (d) => d.data,
  });
}

export function useCreateVaultEntity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: VaultEntityRequest) => vaultService.createEntity(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.entities }),
  });
}

export function useUpdateVaultEntity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: VaultEntityRequest }) =>
      vaultService.updateEntity(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.entities }),
  });
}

export function useDeleteVaultEntity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => vaultService.deleteEntity(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.entities }),
  });
}

// ─── Items ────────────────────────────────────────────────────────────────────

export function useVaultItems(entityId: number) {
  return useQuery({
    queryKey: KEYS.items(entityId),
    queryFn: () => vaultService.listItems(entityId),
    select: (d) => d.data,
    enabled: entityId > 0,
  });
}

export function useCreateVaultItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ entityId, body }: { entityId: number; body: VaultItemRequest }) =>
      vaultService.createItem(entityId, body),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: KEYS.items(vars.entityId) });
      qc.invalidateQueries({ queryKey: KEYS.entities });
    },
  });
}

export function useUpdateVaultItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      itemId,
      entityId,
      body,
    }: {
      itemId: number;
      entityId: number;
      body: VaultItemUpdateRequest;
    }) => vaultService.updateItem(itemId, body),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: KEYS.items(vars.entityId) });
    },
  });
}

export function useDeleteVaultItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, entityId }: { itemId: number; entityId: number }) =>
      vaultService.deleteItem(itemId),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: KEYS.items(vars.entityId) });
      qc.invalidateQueries({ queryKey: KEYS.entities });
    },
  });
}

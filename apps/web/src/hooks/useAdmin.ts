import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminService } from "@/services/admin-service";
import {
  AdminResetPasswordRequest,
  AdminUpdateUserRequest,
  CreateInviteRequest,
} from "@/types/admin/admin";

const ADMIN_KEYS = {
  all: ["admin"] as const,
  users: (search?: string) => ["admin", "users", search ?? ""] as const,
  invites: ["admin", "invites"] as const,
};

export function useAdminUsers(search?: string) {
  return useQuery({
    queryKey: ADMIN_KEYS.users(search),
    queryFn: () => adminService.listUsers({ search }),
    select: (d) => d.data,
  });
}

export function useUpdateAdminUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: AdminUpdateUserRequest }) =>
      adminService.updateUser(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ADMIN_KEYS.all }),
  });
}

export function useResetAdminUserPassword() {
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: AdminResetPasswordRequest }) =>
      adminService.resetPassword(id, body),
  });
}

export function useDeleteAdminUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminService.deleteUser(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ADMIN_KEYS.all }),
  });
}

export function useAdminInvites() {
  return useQuery({
    queryKey: ADMIN_KEYS.invites,
    queryFn: () => adminService.listInvites(),
    select: (d) => d.data,
  });
}

export function useCreateInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateInviteRequest) => adminService.createInvite(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ADMIN_KEYS.all }),
  });
}

export function useRevokeInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminService.revokeInvite(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ADMIN_KEYS.all }),
  });
}

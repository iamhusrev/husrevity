import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/providers/AuthProvider";
import { AuthService } from "@/services/auth-service";
import type { NavPreferences } from "@/types/user/user";

export function useUpdateNavPreferences() {
  const { applyUser } = useAuth();
  return useMutation({
    mutationFn: (prefs: NavPreferences) => AuthService.updateNavPreferences(prefs),
    onSuccess: (user) => applyUser(user),
  });
}

export function useResetNavPreferences() {
  const { applyUser } = useAuth();
  return useMutation({
    mutationFn: () => AuthService.resetNavPreferences(),
    onSuccess: (user) => applyUser(user),
  });
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { planService } from "@/services/plan-service";
import { PlanItemRequest, PlanRequest } from "@/types/plan/plan";

const PLAN_KEYS = {
  all: ["plans"] as const,
  detail: (id: number) => ["plans", id] as const,
  items: (planId: number) => ["plan-items", planId] as const,
};

export function usePlans() {
  return useQuery({
    queryKey: PLAN_KEYS.all,
    queryFn: () => planService.listPlans(),
    select: (d) => d.data,
  });
}

export function usePlan(id: number) {
  return useQuery({
    queryKey: PLAN_KEYS.detail(id),
    queryFn: () => planService.getPlan(id),
    select: (d) => d.data,
    enabled: Number.isFinite(id) && id > 0,
  });
}

export function useCreatePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PlanRequest) => planService.createPlan(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: PLAN_KEYS.all }),
  });
}

export function useUpdatePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: PlanRequest }) =>
      planService.updatePlan(id, body),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: PLAN_KEYS.all });
      qc.invalidateQueries({ queryKey: PLAN_KEYS.detail(vars.id) });
    },
  });
}

export function useDeletePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => planService.deletePlan(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: PLAN_KEYS.all }),
  });
}

export function useRestorePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => planService.restorePlan(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: PLAN_KEYS.all }),
  });
}

export function usePlanItems(planId: number) {
  return useQuery({
    queryKey: PLAN_KEYS.items(planId),
    queryFn: () => planService.listItems(planId),
    select: (d) => d.data,
    enabled: Number.isFinite(planId) && planId > 0,
  });
}

export function useCreatePlanItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, body }: { planId: number; body: PlanItemRequest }) =>
      planService.createItem(planId, body),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: PLAN_KEYS.items(vars.planId) });
    },
  });
}

export function useUpdatePlanItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; planId: number; body: PlanItemRequest }) =>
      planService.updateItem(id, body),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: PLAN_KEYS.items(vars.planId) });
    },
  });
}

export function useDeletePlanItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: number; planId: number }) => planService.deleteItem(id),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: PLAN_KEYS.items(vars.planId) });
    },
  });
}

export function useRestorePlanItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: number; planId: number }) => planService.restoreItem(id),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: PLAN_KEYS.items(vars.planId) });
    },
  });
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  financeService,
  TransactionFilters,
} from "@/services/finance-service";
import {
  AccountRequest,
  CategoryRequest,
  DebtRequest,
  TransactionRequest,
  TransferRequest,
} from "@/types/finance/finance";

const FINANCE_KEYS = {
  all: ["finance"] as const,
  accounts: ["finance", "accounts"] as const,
  categories: ["finance", "categories"] as const,
  transactions: (filters: TransactionFilters) =>
    ["finance", "transactions", filters] as const,
  debts: (onlyOpen: boolean) => ["finance", "debts", onlyOpen] as const,
  summary: (from?: string, to?: string) =>
    ["finance", "summary", from ?? null, to ?? null] as const,
};

// Accounts
export function useFinanceAccounts() {
  return useQuery({
    queryKey: FINANCE_KEYS.accounts,
    queryFn: () => financeService.listAccounts(),
    select: (d) => d.data,
  });
}
export function useCreateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AccountRequest) => financeService.createAccount(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: FINANCE_KEYS.all }),
  });
}
export function useUpdateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: AccountRequest }) =>
      financeService.updateAccount(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: FINANCE_KEYS.all }),
  });
}
export function useDeleteAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => financeService.deleteAccount(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: FINANCE_KEYS.all }),
  });
}

// Categories
export function useFinanceCategories() {
  return useQuery({
    queryKey: FINANCE_KEYS.categories,
    queryFn: () => financeService.listCategories(),
    select: (d) => d.data,
  });
}
export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CategoryRequest) => financeService.createCategory(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: FINANCE_KEYS.all }),
  });
}
export function useUpdateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: CategoryRequest }) =>
      financeService.updateCategory(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: FINANCE_KEYS.all }),
  });
}
export function useDeleteCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => financeService.deleteCategory(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: FINANCE_KEYS.all }),
  });
}

// Transactions
export function useFinanceTransactions(filters: TransactionFilters = {}) {
  return useQuery({
    queryKey: FINANCE_KEYS.transactions(filters),
    queryFn: () => financeService.listTransactions(filters),
    select: (d) => d.data,
  });
}
export function useCreateTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: TransactionRequest) =>
      financeService.createTransaction(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: FINANCE_KEYS.all }),
  });
}
export function useUpdateTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: TransactionRequest }) =>
      financeService.updateTransaction(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: FINANCE_KEYS.all }),
  });
}
export function useDeleteTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => financeService.deleteTransaction(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: FINANCE_KEYS.all }),
  });
}
export function useCreateTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: TransferRequest) => financeService.createTransfer(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: FINANCE_KEYS.all }),
  });
}

// Debts
export function useFinanceDebts(onlyOpen = false) {
  return useQuery({
    queryKey: FINANCE_KEYS.debts(onlyOpen),
    queryFn: () => financeService.listDebts(onlyOpen),
    select: (d) => d.data,
  });
}
export function useCreateDebt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: DebtRequest) => financeService.createDebt(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: FINANCE_KEYS.all }),
  });
}
export function useUpdateDebt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: DebtRequest }) =>
      financeService.updateDebt(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: FINANCE_KEYS.all }),
  });
}
export function useSettleDebt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => financeService.settleDebt(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: FINANCE_KEYS.all }),
  });
}
export function useDeleteDebt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => financeService.deleteDebt(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: FINANCE_KEYS.all }),
  });
}

// Summary
export function useFinanceSummary(from?: string, to?: string) {
  return useQuery({
    queryKey: FINANCE_KEYS.summary(from, to),
    queryFn: () => financeService.summary(from, to),
    select: (d) => d.data,
  });
}

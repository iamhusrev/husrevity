export const ACCOUNT_TYPES = ["bank", "card", "cash", "savings"] as const;
export type FinanceAccountType = (typeof ACCOUNT_TYPES)[number];

export const ASSET_TYPES = [
  "cash",
  "property",
  "vehicle",
  "gold",
  "investment",
  "other",
] as const;
export type FinanceAssetType = (typeof ASSET_TYPES)[number];

export type FinanceCategoryKind = "income" | "expense";
export type FinanceTransactionKind = "income" | "expense" | "transfer";
export type FinanceDebtDirection = "owed_to_me" | "i_owe";

export interface AccountResponse {
  id: string;
  name: string;
  type: string;
  currency: string;
  openingBalance: number;
  colorToken: string | null;
  icon: string | null;
  archived: boolean;
  position: number;
  balance: number;
  createdAt: string;
}

export interface AccountRequest {
  name: string;
  type?: FinanceAccountType;
  currency?: string;
  openingBalance?: number;
  colorToken?: string | null;
  icon?: string | null;
  archived?: boolean;
}

export interface CategoryResponse {
  id: string;
  name: string;
  kind: FinanceCategoryKind;
  colorToken: string | null;
  icon: string | null;
  position: number;
}

export interface CategoryRequest {
  name: string;
  kind: FinanceCategoryKind;
  colorToken?: string | null;
  icon?: string | null;
}

export interface TransactionResponse {
  id: string;
  accountId: string;
  categoryId: string | null;
  kind: FinanceTransactionKind;
  amount: number;
  currency: string;
  occurredAt: string;
  description: string | null;
  transferPairId: string | null;
  createdAt: string;
}

export interface TransactionRequest {
  accountId: string;
  categoryId?: string | null;
  kind: "income" | "expense";
  amount: number;
  currency?: string;
  occurredAt: string;
  description?: string | null;
}

export interface TransferRequest {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  currency?: string;
  occurredAt: string;
  description?: string | null;
}

export interface DebtResponse {
  id: string;
  direction: FinanceDebtDirection;
  counterparty: string;
  principalAmount: number;
  currency: string;
  interestRate: number | null;
  dueAt: string | null;
  settledAt: string | null;
  notifyMinutesBefore: number | null;
  notes: string | null;
  createdAt: string;
}

export interface DebtRequest {
  direction: FinanceDebtDirection;
  counterparty: string;
  principalAmount: number;
  currency?: string;
  interestRate?: number | null;
  dueAt?: string | null;
  notifyMinutesBefore?: number | null;
  notes?: string | null;
}

export interface AssetResponse {
  id: string;
  name: string;
  type: string;
  value: number;
  currency: string;
  acquiredAt: string | null;
  colorToken: string | null;
  icon: string | null;
  notes: string | null;
  position: number;
  createdAt: string;
}

export interface AssetRequest {
  name: string;
  type?: FinanceAssetType;
  value: number;
  currency?: string;
  acquiredAt?: string | null;
  colorToken?: string | null;
  icon?: string | null;
  notes?: string | null;
}

export interface InstallmentResponse {
  id: string;
  sequence: number;
  amount: number;
  dueAt: string;
  paidAt: string | null;
}

export interface LoanResponse {
  id: string;
  name: string;
  lender: string | null;
  principalAmount: number;
  installmentCount: number;
  installmentAmount: number;
  interestRate: number | null;
  interestFree: boolean;
  startDate: string;
  notifyMinutesBefore: number | null;
  currency: string;
  notes: string | null;
  settledAt: string | null;
  paidCount: number;
  remainingCount: number;
  paidAmount: number;
  remainingAmount: number;
  nextDueAt: string | null;
  installments: InstallmentResponse[];
  createdAt: string;
}

export interface LoanRequest {
  name: string;
  lender?: string | null;
  principalAmount: number;
  installmentCount: number;
  installmentAmount: number;
  interestRate?: number | null;
  interestFree?: boolean;
  startDate: string;
  notifyMinutesBefore?: number | null;
  currency?: string;
  notes?: string | null;
}

export interface SummaryResponse {
  from: string;
  to: string;
  income: number;
  expense: number;
  net: number;
  byCategory: {
    categoryId: string | null;
    categoryName: string;
    kind: FinanceCategoryKind;
    total: number;
  }[];
  accountBalances: {
    accountId: string;
    name: string;
    balance: number;
    currency: string;
  }[];
  upcomingDebts: DebtResponse[];
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  assetsByType: { type: string; total: number }[];
  upcomingInstallments: {
    loanId: string;
    loanName: string;
    installmentId: string;
    amount: number;
    dueAt: string;
  }[];
}

export function formatTRY(amount: number): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

import apiClient from "./api-client";
import { ApiResponse } from "@/types/common/api-response";
import {
  AccountRequest,
  AccountResponse,
  AssetRequest,
  AssetResponse,
  CategoryRequest,
  CategoryResponse,
  DebtRequest,
  DebtResponse,
  LoanRequest,
  LoanResponse,
  SummaryResponse,
  TransactionRequest,
  TransactionResponse,
  TransferRequest,
} from "@/types/finance/finance";
import { FINANCE_ENDPOINTS } from "@/utils/api-endpoints";

export interface TransactionFilters {
  from?: string;
  to?: string;
  accountId?: string;
  categoryId?: string;
  kind?: "income" | "expense" | "transfer";
  limit?: number;
  offset?: number;
}

export const financeService = {
  // Accounts
  async listAccounts(): Promise<ApiResponse<AccountResponse[]>> {
    const r = await apiClient.get(FINANCE_ENDPOINTS.ACCOUNTS);
    return r.data;
  },
  async createAccount(body: AccountRequest): Promise<ApiResponse<AccountResponse>> {
    const r = await apiClient.post(FINANCE_ENDPOINTS.ACCOUNTS, body);
    return r.data;
  },
  async updateAccount(
    id: string,
    body: AccountRequest,
  ): Promise<ApiResponse<AccountResponse>> {
    const r = await apiClient.put(FINANCE_ENDPOINTS.ACCOUNT_BY_ID(id), body);
    return r.data;
  },
  async deleteAccount(id: string): Promise<ApiResponse<void>> {
    const r = await apiClient.delete(FINANCE_ENDPOINTS.ACCOUNT_BY_ID(id));
    return r.data;
  },

  // Categories
  async listCategories(): Promise<ApiResponse<CategoryResponse[]>> {
    const r = await apiClient.get(FINANCE_ENDPOINTS.CATEGORIES);
    return r.data;
  },
  async createCategory(body: CategoryRequest): Promise<ApiResponse<CategoryResponse>> {
    const r = await apiClient.post(FINANCE_ENDPOINTS.CATEGORIES, body);
    return r.data;
  },
  async updateCategory(
    id: string,
    body: CategoryRequest,
  ): Promise<ApiResponse<CategoryResponse>> {
    const r = await apiClient.put(FINANCE_ENDPOINTS.CATEGORY_BY_ID(id), body);
    return r.data;
  },
  async deleteCategory(id: string): Promise<ApiResponse<void>> {
    const r = await apiClient.delete(FINANCE_ENDPOINTS.CATEGORY_BY_ID(id));
    return r.data;
  },

  // Transactions
  async listTransactions(
    filters: TransactionFilters = {},
  ): Promise<ApiResponse<TransactionResponse[]>> {
    const r = await apiClient.get(FINANCE_ENDPOINTS.TRANSACTIONS, {
      params: filters,
    });
    return r.data;
  },
  async createTransaction(
    body: TransactionRequest,
  ): Promise<ApiResponse<TransactionResponse>> {
    const r = await apiClient.post(FINANCE_ENDPOINTS.TRANSACTIONS, body);
    return r.data;
  },
  async updateTransaction(
    id: string,
    body: TransactionRequest,
  ): Promise<ApiResponse<TransactionResponse>> {
    const r = await apiClient.put(FINANCE_ENDPOINTS.TRANSACTION_BY_ID(id), body);
    return r.data;
  },
  async deleteTransaction(id: string): Promise<ApiResponse<void>> {
    const r = await apiClient.delete(FINANCE_ENDPOINTS.TRANSACTION_BY_ID(id));
    return r.data;
  },
  async createTransfer(
    body: TransferRequest,
  ): Promise<ApiResponse<{ from: TransactionResponse; to: TransactionResponse }>> {
    const r = await apiClient.post(FINANCE_ENDPOINTS.TRANSFERS, body);
    return r.data;
  },

  // Debts
  async listDebts(onlyOpen = false): Promise<ApiResponse<DebtResponse[]>> {
    const r = await apiClient.get(FINANCE_ENDPOINTS.DEBTS, {
      params: { onlyOpen },
    });
    return r.data;
  },
  async createDebt(body: DebtRequest): Promise<ApiResponse<DebtResponse>> {
    const r = await apiClient.post(FINANCE_ENDPOINTS.DEBTS, body);
    return r.data;
  },
  async updateDebt(id: string, body: DebtRequest): Promise<ApiResponse<DebtResponse>> {
    const r = await apiClient.put(FINANCE_ENDPOINTS.DEBT_BY_ID(id), body);
    return r.data;
  },
  async settleDebt(id: string): Promise<ApiResponse<DebtResponse>> {
    const r = await apiClient.patch(FINANCE_ENDPOINTS.DEBT_SETTLE(id));
    return r.data;
  },
  async deleteDebt(id: string): Promise<ApiResponse<void>> {
    const r = await apiClient.delete(FINANCE_ENDPOINTS.DEBT_BY_ID(id));
    return r.data;
  },

  // Assets
  async listAssets(): Promise<ApiResponse<AssetResponse[]>> {
    const r = await apiClient.get(FINANCE_ENDPOINTS.ASSETS);
    return r.data;
  },
  async createAsset(body: AssetRequest): Promise<ApiResponse<AssetResponse>> {
    const r = await apiClient.post(FINANCE_ENDPOINTS.ASSETS, body);
    return r.data;
  },
  async updateAsset(
    id: string,
    body: AssetRequest,
  ): Promise<ApiResponse<AssetResponse>> {
    const r = await apiClient.put(FINANCE_ENDPOINTS.ASSET_BY_ID(id), body);
    return r.data;
  },
  async deleteAsset(id: string): Promise<ApiResponse<void>> {
    const r = await apiClient.delete(FINANCE_ENDPOINTS.ASSET_BY_ID(id));
    return r.data;
  },

  // Loans
  async listLoans(): Promise<ApiResponse<LoanResponse[]>> {
    const r = await apiClient.get(FINANCE_ENDPOINTS.LOANS);
    return r.data;
  },
  async createLoan(body: LoanRequest): Promise<ApiResponse<LoanResponse>> {
    const r = await apiClient.post(FINANCE_ENDPOINTS.LOANS, body);
    return r.data;
  },
  async updateLoan(
    id: string,
    body: LoanRequest,
  ): Promise<ApiResponse<LoanResponse>> {
    const r = await apiClient.put(FINANCE_ENDPOINTS.LOAN_BY_ID(id), body);
    return r.data;
  },
  async deleteLoan(id: string): Promise<ApiResponse<void>> {
    const r = await apiClient.delete(FINANCE_ENDPOINTS.LOAN_BY_ID(id));
    return r.data;
  },
  async payInstallment(
    loanId: string,
    installmentId: string,
  ): Promise<ApiResponse<LoanResponse>> {
    const r = await apiClient.patch(
      FINANCE_ENDPOINTS.LOAN_INSTALLMENT_PAY(loanId, installmentId),
    );
    return r.data;
  },

  // Summary
  async summary(
    from?: string,
    to?: string,
  ): Promise<ApiResponse<SummaryResponse>> {
    const r = await apiClient.get(FINANCE_ENDPOINTS.SUMMARY, {
      params: { from, to },
    });
    return r.data;
  },
};

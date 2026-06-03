import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  Length,
  MaxLength,
  Min,
} from 'class-validator';
import { FinanceAccount } from '../finance-account.entity';
import {
  FinanceCategory,
  FinanceCategoryKind,
} from '../finance-category.entity';
import {
  FinanceTransaction,
  FinanceTransactionKind,
} from '../finance-transaction.entity';
import {
  FinanceDebt,
  FinanceDebtDirection,
} from '../finance-debt.entity';
import { FinanceAsset } from '../finance-asset.entity';
import { FinanceLoan } from '../finance-loan.entity';
import { FinanceInstallment } from '../finance-installment.entity';

export const ACCOUNT_TYPES = ['bank', 'card', 'cash', 'savings'] as const;
export type FinanceAccountType = (typeof ACCOUNT_TYPES)[number];

export const ASSET_TYPES = [
  'cash',
  'property',
  'vehicle',
  'gold',
  'investment',
  'other',
] as const;
export type FinanceAssetType = (typeof ASSET_TYPES)[number];

export const CATEGORY_KINDS: FinanceCategoryKind[] = ['income', 'expense'];
export const TX_KINDS: FinanceTransactionKind[] = [
  'income',
  'expense',
  'transfer',
];
export const DEBT_DIRECTIONS: FinanceDebtDirection[] = [
  'owed_to_me',
  'i_owe',
];

// ─── Account ───────────────────────────────────────────────────────────────

export class AccountRequestDto {
  @IsNotEmpty() @MaxLength(120) name!: string;
  @IsOptional() @IsIn([...ACCOUNT_TYPES]) type?: FinanceAccountType;
  @IsOptional() @Length(3, 3) currency?: string;
  @IsOptional() @IsNumber() openingBalance?: number;
  @IsOptional() @MaxLength(24) colorToken?: string | null;
  @IsOptional() @MaxLength(32) icon?: string | null;
  @IsOptional() @IsBoolean() archived?: boolean;
}

export class AccountResponseDto {
  id!: string;
  name!: string;
  type!: string;
  currency!: string;
  openingBalance!: number;
  colorToken!: string | null;
  icon!: string | null;
  archived!: boolean;
  position!: number;
  /** Derived: openingBalance + Σ inflows − Σ outflows ± transfers. */
  balance!: number;
  createdAt!: string;

  static from(a: FinanceAccount, balance: number): AccountResponseDto {
    return {
      id: a.id,
      name: a.name,
      type: a.type,
      currency: a.currency,
      openingBalance: Number(a.openingBalance),
      colorToken: a.colorToken,
      icon: a.icon,
      archived: a.archived,
      position: a.position,
      balance: Number(balance.toFixed(2)),
      createdAt: a.createdAt.toISOString(),
    };
  }
}

// ─── Category ──────────────────────────────────────────────────────────────

export class CategoryRequestDto {
  @IsNotEmpty() @MaxLength(80) name!: string;
  @IsIn(CATEGORY_KINDS) kind!: FinanceCategoryKind;
  @IsOptional() @MaxLength(24) colorToken?: string | null;
  @IsOptional() @MaxLength(32) icon?: string | null;
}

export class CategoryResponseDto {
  id!: string;
  name!: string;
  kind!: FinanceCategoryKind;
  colorToken!: string | null;
  icon!: string | null;
  position!: number;

  static from(c: FinanceCategory): CategoryResponseDto {
    return {
      id: c.id,
      name: c.name,
      kind: c.kind,
      colorToken: c.colorToken,
      icon: c.icon,
      position: c.position,
    };
  }
}

// ─── Transaction ───────────────────────────────────────────────────────────

export class TransactionRequestDto {
  @IsNotEmpty() accountId!: string;
  @IsOptional() categoryId?: string | null;
  @IsIn(['income', 'expense']) kind!: 'income' | 'expense';
  @IsNumber() @Min(0.01) amount!: number;
  @IsOptional() @Length(3, 3) currency?: string;
  @IsDateString() occurredAt!: string;
  @IsOptional() @MaxLength(2000) description?: string | null;
}

export class TransferRequestDto {
  @IsNotEmpty() fromAccountId!: string;
  @IsNotEmpty() toAccountId!: string;
  @IsNumber() @Min(0.01) amount!: number;
  @IsOptional() @Length(3, 3) currency?: string;
  @IsDateString() occurredAt!: string;
  @IsOptional() @MaxLength(2000) description?: string | null;
}

export class TransactionResponseDto {
  id!: string;
  accountId!: string;
  categoryId!: string | null;
  kind!: FinanceTransactionKind;
  amount!: number;
  currency!: string;
  occurredAt!: string;
  description!: string | null;
  transferPairId!: string | null;
  debtId!: string | null;
  createdAt!: string;

  static from(t: FinanceTransaction): TransactionResponseDto {
    return {
      id: t.id,
      accountId: t.accountId,
      categoryId: t.categoryId,
      kind: t.kind,
      amount: Number(t.amount),
      currency: t.currency,
      occurredAt: t.occurredAt.toISOString(),
      description: t.description,
      transferPairId: t.transferPairId,
      debtId: t.debtId ?? null,
      createdAt: t.createdAt.toISOString(),
    };
  }
}

export class TransactionListQueryDto {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() accountId?: string;
  @IsOptional() categoryId?: string;
  @IsOptional() @IsIn(TX_KINDS) kind?: FinanceTransactionKind;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset?: number;
}

// ─── Debt ──────────────────────────────────────────────────────────────────

export class DebtRequestDto {
  @IsIn(DEBT_DIRECTIONS) direction!: FinanceDebtDirection;
  @IsNotEmpty() @MaxLength(160) counterparty!: string;
  @IsNumber() @Min(0.01) principalAmount!: number;
  @IsOptional() @Length(3, 3) currency?: string;
  @IsOptional() @IsNumber() interestRate?: number | null;
  @IsOptional() @IsDateString() dueAt?: string | null;
  @IsOptional() @IsInt() notifyMinutesBefore?: number | null;
  @IsOptional() @MaxLength(2000) notes?: string | null;
}

/** A payment made against a debt: charges an account and reduces the balance. */
export class DebtPaymentRequestDto {
  @IsNotEmpty() accountId!: string;
  @IsNumber() @Min(0.01) amount!: number;
  @IsOptional() categoryId?: string | null;
  @IsOptional() @IsDateString() occurredAt?: string;
  @IsOptional() @MaxLength(2000) description?: string | null;
}

export class DebtResponseDto {
  id!: string;
  direction!: FinanceDebtDirection;
  counterparty!: string;
  principalAmount!: number;
  paidAmount!: number;
  remainingAmount!: number;
  currency!: string;
  interestRate!: number | null;
  dueAt!: string | null;
  settledAt!: string | null;
  notifyMinutesBefore!: number | null;
  notes!: string | null;
  createdAt!: string;

  static from(d: FinanceDebt): DebtResponseDto {
    const principal = Number(d.principalAmount);
    const paid = Number(d.paidAmount ?? 0);
    return {
      id: d.id,
      direction: d.direction,
      counterparty: d.counterparty,
      principalAmount: principal,
      paidAmount: Number(paid.toFixed(2)),
      remainingAmount: Number(Math.max(principal - paid, 0).toFixed(2)),
      currency: d.currency,
      interestRate: d.interestRate !== null ? Number(d.interestRate) : null,
      dueAt: d.dueAt ? d.dueAt.toISOString() : null,
      settledAt: d.settledAt ? d.settledAt.toISOString() : null,
      notifyMinutesBefore: d.notifyMinutesBefore,
      notes: d.notes,
      createdAt: d.createdAt.toISOString(),
    };
  }
}

// ─── Asset ───────────────────────────────────────────────────────────────────

export class AssetRequestDto {
  @IsNotEmpty() @MaxLength(120) name!: string;
  @IsOptional() @IsIn([...ASSET_TYPES]) type?: FinanceAssetType;
  @IsNumber() @Min(0) value!: number;
  @IsOptional() @Length(3, 3) currency?: string;
  @IsOptional() @IsDateString() acquiredAt?: string | null;
  @IsOptional() @MaxLength(24) colorToken?: string | null;
  @IsOptional() @MaxLength(32) icon?: string | null;
  @IsOptional() @MaxLength(2000) notes?: string | null;
}

export class AssetResponseDto {
  id!: string;
  name!: string;
  type!: string;
  value!: number;
  currency!: string;
  acquiredAt!: string | null;
  colorToken!: string | null;
  icon!: string | null;
  notes!: string | null;
  position!: number;
  createdAt!: string;

  static from(a: FinanceAsset): AssetResponseDto {
    return {
      id: a.id,
      name: a.name,
      type: a.type,
      value: Number(a.value),
      currency: a.currency,
      acquiredAt: a.acquiredAt ? a.acquiredAt.toISOString() : null,
      colorToken: a.colorToken,
      icon: a.icon,
      notes: a.notes,
      position: a.position,
      createdAt: a.createdAt.toISOString(),
    };
  }
}

// ─── Loan / installments ─────────────────────────────────────────────────────

export class LoanRequestDto {
  @IsNotEmpty() @MaxLength(160) name!: string;
  @IsOptional() @MaxLength(160) lender?: string | null;
  @IsNumber() @Min(0.01) principalAmount!: number;
  @IsInt() @Min(1) installmentCount!: number;
  @IsNumber() @Min(0.01) installmentAmount!: number;
  @IsOptional() @IsNumber() @Min(0) interestRate?: number | null;
  @IsOptional() @IsBoolean() interestFree?: boolean;
  @IsDateString() startDate!: string;
  @IsOptional() @IsInt() notifyMinutesBefore?: number | null;
  @IsOptional() @Length(3, 3) currency?: string;
  @IsOptional() @MaxLength(2000) notes?: string | null;
}

export class InstallmentResponseDto {
  id!: string;
  sequence!: number;
  amount!: number;
  dueAt!: string;
  paidAt!: string | null;

  static from(i: FinanceInstallment): InstallmentResponseDto {
    return {
      id: i.id,
      sequence: i.sequence,
      amount: Number(i.amount),
      dueAt: i.dueAt.toISOString(),
      paidAt: i.paidAt ? i.paidAt.toISOString() : null,
    };
  }
}

export class LoanResponseDto {
  id!: string;
  name!: string;
  lender!: string | null;
  principalAmount!: number;
  installmentCount!: number;
  installmentAmount!: number;
  interestRate!: number | null;
  interestFree!: boolean;
  startDate!: string;
  notifyMinutesBefore!: number | null;
  currency!: string;
  notes!: string | null;
  settledAt!: string | null;
  // Derived from the installment rows:
  paidCount!: number;
  remainingCount!: number;
  paidAmount!: number;
  remainingAmount!: number;
  nextDueAt!: string | null;
  installments!: InstallmentResponseDto[];
  createdAt!: string;

  static from(
    l: FinanceLoan,
    installments: FinanceInstallment[],
  ): LoanResponseDto {
    const sorted = [...installments].sort((a, b) => a.sequence - b.sequence);
    const paid = sorted.filter((i) => i.paidAt !== null);
    const paidAmount = paid.reduce((sum, i) => sum + Number(i.amount), 0);
    const totalAmount = sorted.reduce((sum, i) => sum + Number(i.amount), 0);
    const nextDue = sorted.find((i) => i.paidAt === null) ?? null;
    return {
      id: l.id,
      name: l.name,
      lender: l.lender,
      principalAmount: Number(l.principalAmount),
      installmentCount: l.installmentCount,
      installmentAmount: Number(l.installmentAmount),
      interestRate: l.interestRate !== null ? Number(l.interestRate) : null,
      interestFree: l.interestFree,
      startDate: l.startDate.toISOString(),
      notifyMinutesBefore: l.notifyMinutesBefore,
      currency: l.currency,
      notes: l.notes,
      settledAt: l.settledAt ? l.settledAt.toISOString() : null,
      paidCount: paid.length,
      remainingCount: sorted.length - paid.length,
      paidAmount: Number(paidAmount.toFixed(2)),
      remainingAmount: Number((totalAmount - paidAmount).toFixed(2)),
      nextDueAt: nextDue ? nextDue.dueAt.toISOString() : null,
      installments: sorted.map(InstallmentResponseDto.from),
      createdAt: l.createdAt.toISOString(),
    };
  }
}

// ─── Summary ───────────────────────────────────────────────────────────────

export class SummaryQueryDto {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

export class CategoryBreakdownEntryDto {
  categoryId!: string | null;
  categoryName!: string;
  kind!: FinanceCategoryKind;
  total!: number;
}

export class AssetBreakdownEntryDto {
  type!: string;
  total!: number;
}

export class UpcomingInstallmentDto {
  loanId!: string;
  loanName!: string;
  installmentId!: string;
  amount!: number;
  dueAt!: string;
}

export class SummaryResponseDto {
  from!: string;
  to!: string;
  income!: number;
  expense!: number;
  net!: number;
  byCategory!: CategoryBreakdownEntryDto[];
  accountBalances!: { accountId: string; name: string; balance: number; currency: string }[];
  upcomingDebts!: DebtResponseDto[];
  // Net-worth panel:
  totalAssets!: number;
  totalLiabilities!: number;
  netWorth!: number;
  assetsByType!: AssetBreakdownEntryDto[];
  upcomingInstallments!: UpcomingInstallmentDto[];
}

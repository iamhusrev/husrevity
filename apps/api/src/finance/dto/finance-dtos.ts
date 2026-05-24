import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

export const ACCOUNT_TYPES = ['bank', 'card', 'cash', 'savings'] as const;
export type FinanceAccountType = (typeof ACCOUNT_TYPES)[number];

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
  @IsOptional() @IsInt() @Min(1) limit?: number;
  @IsOptional() @IsInt() @Min(0) offset?: number;
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

export class DebtResponseDto {
  id!: string;
  direction!: FinanceDebtDirection;
  counterparty!: string;
  principalAmount!: number;
  currency!: string;
  interestRate!: number | null;
  dueAt!: string | null;
  settledAt!: string | null;
  notifyMinutesBefore!: number | null;
  notes!: string | null;
  createdAt!: string;

  static from(d: FinanceDebt): DebtResponseDto {
    return {
      id: d.id,
      direction: d.direction,
      counterparty: d.counterparty,
      principalAmount: Number(d.principalAmount),
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

export class SummaryResponseDto {
  from!: string;
  to!: string;
  income!: number;
  expense!: number;
  net!: number;
  byCategory!: CategoryBreakdownEntryDto[];
  accountBalances!: { accountId: string; name: string; balance: number; currency: string }[];
  upcomingDebts!: DebtResponseDto[];
}

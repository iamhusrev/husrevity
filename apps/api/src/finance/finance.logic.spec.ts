import { addMonths, buildSchedule, normaliseInterest } from './finance.service';
import {
  AssetResponseDto,
  LoanResponseDto,
} from './dto/finance-dtos';
import { FinanceLoan } from './finance-loan.entity';
import { FinanceInstallment } from './finance-installment.entity';
import { FinanceAsset } from './finance-asset.entity';

describe('normaliseInterest', () => {
  it('treats an explicit interest-free flag as 0% rate', () => {
    expect(normaliseInterest({ interestFree: true, interestRate: 12 })).toEqual({
      interestFree: true,
      interestRate: 0,
    });
  });

  it('infers interest-free when the rate is exactly 0', () => {
    expect(normaliseInterest({ interestRate: 0 })).toEqual({
      interestFree: true,
      interestRate: 0,
    });
  });

  it('keeps a positive rate as interest-bearing', () => {
    expect(normaliseInterest({ interestRate: 4.2 })).toEqual({
      interestFree: false,
      interestRate: 4.2,
    });
  });

  it('defaults to interest-bearing with null rate when nothing is given', () => {
    expect(normaliseInterest({})).toEqual({
      interestFree: false,
      interestRate: null,
    });
  });
});

describe('addMonths', () => {
  it('advances by whole months', () => {
    expect(addMonths(new Date('2026-01-15T00:00:00Z'), 2).getMonth()).toBe(2); // March
  });

  it('clamps the day to the shorter target month', () => {
    // Jan 31 + 1 month must not roll into March.
    const result = addMonths(new Date(2026, 0, 31), 1);
    expect(result.getMonth()).toBe(1); // February
    expect(result.getDate()).toBe(28); // 2026 is not a leap year
  });
});

describe('buildSchedule', () => {
  it('produces one row per installment with sequential monthly due dates', () => {
    const start = new Date(2026, 5, 10); // 10 Jun 2026
    const rows = buildSchedule('7', '99', start, 3, 500);

    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.sequence)).toEqual([1, 2, 3]);
    expect(rows.every((r) => r.amount === 500)).toBe(true);
    expect(rows.every((r) => r.ownerId === '7' && r.loanId === '99')).toBe(true);
    expect(rows.every((r) => r.paidAt === null)).toBe(true);
    expect(rows[0].dueAt.getMonth()).toBe(5); // June
    expect(rows[1].dueAt.getMonth()).toBe(6); // July
    expect(rows[2].dueAt.getMonth()).toBe(7); // August
  });
});

function makeLoan(overrides: Partial<FinanceLoan> = {}): FinanceLoan {
  return {
    id: '1',
    name: 'Telefon taksiti',
    lender: 'Garanti',
    principalAmount: 12000,
    installmentCount: 12,
    installmentAmount: 1000,
    interestRate: 0,
    interestFree: true,
    startDate: new Date('2026-01-15T00:00:00Z'),
    notifyMinutesBefore: null,
    currency: 'TRY',
    notes: null,
    settledAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  } as FinanceLoan;
}

function makeInstallment(
  seq: number,
  paid: boolean,
  amount = 1000,
): FinanceInstallment {
  return {
    id: String(seq),
    sequence: seq,
    amount,
    dueAt: new Date(2026, seq - 1, 15),
    paidAt: paid ? new Date(2026, seq - 1, 16) : null,
  } as FinanceInstallment;
}

describe('LoanResponseDto.from', () => {
  it('derives paid/remaining counts, amounts and the next due date', () => {
    const loan = makeLoan({ installmentCount: 4, principalAmount: 4000 });
    const installments = [
      makeInstallment(1, true),
      makeInstallment(2, true),
      makeInstallment(3, false),
      makeInstallment(4, false),
    ];

    const dto = LoanResponseDto.from(loan, installments);

    expect(dto.paidCount).toBe(2);
    expect(dto.remainingCount).toBe(2);
    expect(dto.paidAmount).toBe(2000);
    expect(dto.remainingAmount).toBe(2000);
    expect(dto.interestFree).toBe(true);
    expect(dto.nextDueAt).toBe(installments[2].dueAt.toISOString());
    expect(dto.installments).toHaveLength(4);
  });

  it('reports a null next due date once everything is paid', () => {
    const loan = makeLoan({ installmentCount: 2 });
    const dto = LoanResponseDto.from(loan, [
      makeInstallment(1, true),
      makeInstallment(2, true),
    ]);

    expect(dto.remainingCount).toBe(0);
    expect(dto.remainingAmount).toBe(0);
    expect(dto.nextDueAt).toBeNull();
  });

  it('sorts installments by sequence regardless of input order', () => {
    const loan = makeLoan({ installmentCount: 3 });
    const dto = LoanResponseDto.from(loan, [
      makeInstallment(3, false),
      makeInstallment(1, true),
      makeInstallment(2, false),
    ]);

    expect(dto.installments.map((i) => i.sequence)).toEqual([1, 2, 3]);
    expect(dto.nextDueAt).toBe(new Date(2026, 1, 15).toISOString()); // seq 2
  });
});

describe('AssetResponseDto.from', () => {
  it('maps fields and serialises dates', () => {
    const asset = {
      id: '5',
      name: 'Altın',
      type: 'gold',
      value: 75000,
      currency: 'TRY',
      acquiredAt: new Date('2025-12-01T00:00:00Z'),
      colorToken: null,
      icon: null,
      notes: 'çeyrek',
      position: 0,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    } as FinanceAsset;

    const dto = AssetResponseDto.from(asset);

    expect(dto.value).toBe(75000);
    expect(dto.type).toBe('gold');
    expect(dto.acquiredAt).toBe('2025-12-01T00:00:00.000Z');
    expect(dto.notes).toBe('çeyrek');
  });

  it('handles a null acquired date', () => {
    const asset = {
      id: '6',
      name: 'Nakit',
      type: 'cash',
      value: 1000,
      currency: 'TRY',
      acquiredAt: null,
      colorToken: null,
      icon: null,
      notes: null,
      position: 0,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    } as FinanceAsset;

    expect(AssetResponseDto.from(asset).acquiredAt).toBeNull();
  });
});

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  DataSource,
  In,
  IsNull,
  LessThanOrEqual,
  MoreThanOrEqual,
  Not,
  Repository,
} from 'typeorm';
import { ApiException } from '../common/api.exception';
import { NotificationService } from '../notification/notification.service';
import {
  formatLeadTimeBody,
  leadTimeFireAt,
} from '../notification/notification-scheduling';
import { FinanceAccount } from './finance-account.entity';
import { FinanceCategory } from './finance-category.entity';
import { FinanceTransaction } from './finance-transaction.entity';
import { FinanceDebt } from './finance-debt.entity';
import { FinanceAsset } from './finance-asset.entity';
import { FinanceLoan } from './finance-loan.entity';
import { FinanceInstallment } from './finance-installment.entity';
import {
  AccountRequestDto,
  AccountResponseDto,
  AssetRequestDto,
  AssetResponseDto,
  CategoryBreakdownEntryDto,
  CategoryRequestDto,
  CategoryResponseDto,
  DebtPaymentRequestDto,
  DebtRequestDto,
  DebtResponseDto,
  LoanRequestDto,
  LoanResponseDto,
  SummaryQueryDto,
  SummaryResponseDto,
  TransactionListQueryDto,
  TransactionRequestDto,
  TransactionResponseDto,
  TransferRequestDto,
  UpcomingInstallmentDto,
} from './dto/finance-dtos';

@Injectable()
export class FinanceService {
  constructor(
    @InjectRepository(FinanceAccount)
    private readonly accounts: Repository<FinanceAccount>,
    @InjectRepository(FinanceCategory)
    private readonly categories: Repository<FinanceCategory>,
    @InjectRepository(FinanceTransaction)
    private readonly transactions: Repository<FinanceTransaction>,
    @InjectRepository(FinanceDebt)
    private readonly debts: Repository<FinanceDebt>,
    @InjectRepository(FinanceAsset)
    private readonly assets: Repository<FinanceAsset>,
    @InjectRepository(FinanceLoan)
    private readonly loans: Repository<FinanceLoan>,
    @InjectRepository(FinanceInstallment)
    private readonly installments: Repository<FinanceInstallment>,
    private readonly dataSource: DataSource,
    private readonly notifications: NotificationService,
  ) {}

  // ─── Accounts ────────────────────────────────────────────────────────────

  async listAccounts(ownerId: string): Promise<AccountResponseDto[]> {
    const rows = await this.accounts.find({
      where: { ownerId },
      order: { position: 'ASC', id: 'ASC' },
    });
    if (rows.length === 0) return [];
    const balances = await this.balancesFor(
      ownerId,
      rows.map((r) => r.id),
    );
    return rows.map((r) =>
      AccountResponseDto.from(r, balances.get(r.id) ?? Number(r.openingBalance)),
    );
  }

  async createAccount(
    ownerId: string,
    req: AccountRequestDto,
  ): Promise<AccountResponseDto> {
    const a = this.accounts.create({
      ownerId,
      name: req.name,
      type: req.type ?? 'bank',
      currency: req.currency ?? 'TRY',
      openingBalance: req.openingBalance ?? 0,
      colorToken: req.colorToken ?? null,
      icon: req.icon ?? null,
      archived: req.archived ?? false,
      position: 0,
    });
    const saved = await this.accounts.save(a);
    return AccountResponseDto.from(saved, Number(saved.openingBalance));
  }

  async updateAccount(
    ownerId: string,
    id: string,
    req: AccountRequestDto,
  ): Promise<AccountResponseDto> {
    const a = await this.requireAccount(ownerId, id);
    a.name = req.name;
    if (req.type !== undefined) a.type = req.type;
    if (req.currency !== undefined) a.currency = req.currency;
    if (req.openingBalance !== undefined) a.openingBalance = req.openingBalance;
    if (req.colorToken !== undefined) a.colorToken = req.colorToken ?? null;
    if (req.icon !== undefined) a.icon = req.icon ?? null;
    if (req.archived !== undefined) a.archived = req.archived;
    const saved = await this.accounts.save(a);
    const balance = await this.balanceForAccount(ownerId, saved.id);
    return AccountResponseDto.from(saved, balance);
  }

  async deleteAccount(ownerId: string, id: string): Promise<void> {
    const a = await this.requireAccount(ownerId, id);
    // Block delete when transactions reference the account — deleting would
    // either corrupt the ledger or cascade nuke a chunk of history. UI can
    // surface this and offer "archive instead".
    const txCount = await this.transactions.count({
      where: { ownerId, accountId: a.id },
    });
    if (txCount > 0) {
      throw ApiException.badRequest(
        'Account has transactions — archive it instead of deleting.',
      );
    }
    await this.accounts.softRemove(a);
  }

  // ─── Categories ──────────────────────────────────────────────────────────

  async listCategories(ownerId: string): Promise<CategoryResponseDto[]> {
    const rows = await this.categories.find({
      where: { ownerId },
      order: { kind: 'ASC', position: 'ASC', name: 'ASC' },
    });
    return rows.map(CategoryResponseDto.from);
  }

  async createCategory(
    ownerId: string,
    req: CategoryRequestDto,
  ): Promise<CategoryResponseDto> {
    const c = this.categories.create({
      ownerId,
      name: req.name,
      kind: req.kind,
      colorToken: req.colorToken ?? null,
      icon: req.icon ?? null,
      position: 0,
    });
    try {
      return CategoryResponseDto.from(await this.categories.save(c));
    } catch (e) {
      // Unique (owner_id, name, kind) collision → friendly message.
      if ((e as { code?: string }).code === '23505') {
        throw ApiException.conflict('Category with this name already exists');
      }
      throw e;
    }
  }

  async updateCategory(
    ownerId: string,
    id: string,
    req: CategoryRequestDto,
  ): Promise<CategoryResponseDto> {
    const c = await this.requireCategory(ownerId, id);
    c.name = req.name;
    c.kind = req.kind;
    if (req.colorToken !== undefined) c.colorToken = req.colorToken ?? null;
    if (req.icon !== undefined) c.icon = req.icon ?? null;
    return CategoryResponseDto.from(await this.categories.save(c));
  }

  async deleteCategory(ownerId: string, id: string): Promise<void> {
    const c = await this.requireCategory(ownerId, id);
    // SET NULL on the FK lets us drop a category without invalidating
    // transactions — they just become uncategorised.
    await this.categories.softRemove(c);
  }

  // ─── Transactions ────────────────────────────────────────────────────────

  async listTransactions(
    ownerId: string,
    q: TransactionListQueryDto,
  ): Promise<TransactionResponseDto[]> {
    const qb = this.transactions
      .createQueryBuilder('t')
      .where('t.owner_id = :ownerId', { ownerId });
    if (q.from) qb.andWhere('t.occurred_at >= :from', { from: new Date(q.from) });
    if (q.to) qb.andWhere('t.occurred_at <= :to', { to: new Date(q.to) });
    if (q.accountId)
      qb.andWhere('t.account_id = :accountId', { accountId: q.accountId });
    if (q.categoryId)
      qb.andWhere('t.category_id = :categoryId', { categoryId: q.categoryId });
    if (q.kind) qb.andWhere('t.kind = :kind', { kind: q.kind });
    qb.orderBy('t.occurred_at', 'DESC').addOrderBy('t.id', 'DESC');
    qb.limit(Math.min(q.limit ?? 100, 500));
    if (q.offset) qb.offset(q.offset);
    const rows = await qb.getMany();
    return rows.map(TransactionResponseDto.from);
  }

  async createTransaction(
    ownerId: string,
    req: TransactionRequestDto,
  ): Promise<TransactionResponseDto> {
    const account = await this.requireAccount(ownerId, req.accountId);
    if (req.categoryId) {
      const cat = await this.requireCategory(ownerId, req.categoryId);
      if (cat.kind !== req.kind) {
        throw ApiException.badRequest(
          `Category kind (${cat.kind}) does not match transaction kind (${req.kind})`,
        );
      }
    }
    const t = this.transactions.create({
      ownerId,
      accountId: account.id,
      categoryId: req.categoryId ?? null,
      kind: req.kind,
      amount: req.amount,
      currency: req.currency ?? account.currency,
      occurredAt: new Date(req.occurredAt),
      description: req.description ?? null,
      transferPairId: null,
    });
    return TransactionResponseDto.from(await this.transactions.save(t));
  }

  async updateTransaction(
    ownerId: string,
    id: string,
    req: TransactionRequestDto,
  ): Promise<TransactionResponseDto> {
    const t = await this.requireTransaction(ownerId, id);
    if (t.transferPairId) {
      throw ApiException.badRequest(
        'Transfer transactions must be edited via DELETE + new transfer.',
      );
    }
    const account = await this.requireAccount(ownerId, req.accountId);
    if (req.categoryId) {
      const cat = await this.requireCategory(ownerId, req.categoryId);
      if (cat.kind !== req.kind) {
        throw ApiException.badRequest(
          `Category kind (${cat.kind}) does not match transaction kind (${req.kind})`,
        );
      }
    }
    t.accountId = account.id;
    t.categoryId = req.categoryId ?? null;
    t.kind = req.kind;
    t.amount = req.amount;
    t.currency = req.currency ?? account.currency;
    t.occurredAt = new Date(req.occurredAt);
    t.description = req.description ?? null;
    return TransactionResponseDto.from(await this.transactions.save(t));
  }

  async deleteTransaction(ownerId: string, id: string): Promise<void> {
    const t = await this.requireTransaction(ownerId, id);
    if (t.transferPairId) {
      // Cascade: removing one half of a transfer kills both.
      await this.dataSource.transaction(async (em) => {
        const repo = em.getRepository(FinanceTransaction);
        const pair = await repo.findOne({
          where: { id: t.transferPairId!, ownerId },
        });
        await repo.softRemove(t);
        if (pair) await repo.softRemove(pair);
      });
      return;
    }
    await this.transactions.softRemove(t);
  }

  /**
   * Creates a paired transfer atomically: an `expense` row on the source
   * account and an `income` row on the destination, both linked via
   * `transfer_pair_id`. Balances net to zero across the two accounts.
   */
  async createTransfer(
    ownerId: string,
    req: TransferRequestDto,
  ): Promise<{ from: TransactionResponseDto; to: TransactionResponseDto }> {
    if (req.fromAccountId === req.toAccountId) {
      throw ApiException.badRequest('Source and destination must differ');
    }
    const from = await this.requireAccount(ownerId, req.fromAccountId);
    const to = await this.requireAccount(ownerId, req.toAccountId);
    const occurredAt = new Date(req.occurredAt);
    const description = req.description ?? null;
    const currency = req.currency ?? from.currency;
    return this.dataSource.transaction(async (em) => {
      const repo = em.getRepository(FinanceTransaction);
      const outRow = repo.create({
        ownerId,
        accountId: from.id,
        categoryId: null,
        kind: 'transfer',
        amount: req.amount,
        currency,
        occurredAt,
        description,
        transferPairId: null,
      });
      const inRow = repo.create({
        ownerId,
        accountId: to.id,
        categoryId: null,
        kind: 'transfer',
        amount: req.amount,
        currency,
        occurredAt,
        description,
        transferPairId: null,
      });
      const savedOut = await repo.save(outRow);
      const savedIn = await repo.save(inRow);
      savedOut.transferPairId = savedIn.id;
      savedIn.transferPairId = savedOut.id;
      await repo.save([savedOut, savedIn]);
      return {
        from: TransactionResponseDto.from(savedOut),
        to: TransactionResponseDto.from(savedIn),
      };
    });
  }

  // ─── Debts ───────────────────────────────────────────────────────────────

  async listDebts(
    ownerId: string,
    onlyOpen: boolean,
  ): Promise<DebtResponseDto[]> {
    const where = onlyOpen
      ? { ownerId, settledAt: IsNull() }
      : { ownerId };
    const rows = await this.debts.find({
      where,
      order: { dueAt: 'ASC', id: 'ASC' },
    });
    return rows.map(DebtResponseDto.from);
  }

  async createDebt(
    ownerId: string,
    req: DebtRequestDto,
  ): Promise<DebtResponseDto> {
    const d = this.debts.create({
      ownerId,
      direction: req.direction,
      counterparty: req.counterparty,
      principalAmount: req.principalAmount,
      paidAmount: 0,
      currency: req.currency ?? 'TRY',
      interestRate: req.interestRate ?? null,
      dueAt: req.dueAt ? new Date(req.dueAt) : null,
      settledAt: null,
      notifyMinutesBefore: req.notifyMinutesBefore ?? null,
      notes: req.notes ?? null,
    });
    const saved = await this.debts.save(d);
    await this.syncDebtNotification(saved);
    return DebtResponseDto.from(saved);
  }

  async updateDebt(
    ownerId: string,
    id: string,
    req: DebtRequestDto,
  ): Promise<DebtResponseDto> {
    const d = await this.requireDebt(ownerId, id);
    d.direction = req.direction;
    d.counterparty = req.counterparty;
    d.principalAmount = req.principalAmount;
    if (req.currency !== undefined) d.currency = req.currency;
    if (req.interestRate !== undefined) d.interestRate = req.interestRate ?? null;
    if (req.dueAt !== undefined) d.dueAt = req.dueAt ? new Date(req.dueAt) : null;
    if (req.notifyMinutesBefore !== undefined) {
      d.notifyMinutesBefore = req.notifyMinutesBefore ?? null;
    }
    if (req.notes !== undefined) d.notes = req.notes ?? null;
    const saved = await this.debts.save(d);
    await this.syncDebtNotification(saved);
    return DebtResponseDto.from(saved);
  }

  async settleDebt(ownerId: string, id: string): Promise<DebtResponseDto> {
    const d = await this.requireDebt(ownerId, id);
    d.settledAt = d.settledAt ? null : new Date();
    const saved = await this.debts.save(d);
    await this.syncDebtNotification(saved);
    return DebtResponseDto.from(saved);
  }

  /**
   * Records a payment against a debt: charges the chosen account with a matching
   * transaction (expense when I owe, income when collecting a receivable),
   * accrues `paidAmount`, and auto-settles once fully paid. Atomic so the ledger
   * entry and the debt update never diverge.
   */
  async payDebt(
    ownerId: string,
    id: string,
    req: DebtPaymentRequestDto,
  ): Promise<DebtResponseDto> {
    const debt = await this.requireDebt(ownerId, id);
    const account = await this.requireAccount(ownerId, req.accountId);

    const principal = Number(debt.principalAmount);
    const alreadyPaid = Number(debt.paidAmount ?? 0);
    const remaining = Number((principal - alreadyPaid).toFixed(2));
    if (remaining <= 0) {
      throw ApiException.badRequest('Debt is already fully paid');
    }
    if (req.amount > remaining + 0.001) {
      throw ApiException.badRequest(
        `Payment exceeds the remaining balance (${remaining} ${debt.currency})`,
      );
    }

    // A repayment of money I owe is cash leaving (expense); collecting a
    // receivable is cash arriving (income).
    const kind: 'income' | 'expense' =
      debt.direction === 'i_owe' ? 'expense' : 'income';

    if (req.categoryId) {
      const cat = await this.requireCategory(ownerId, req.categoryId);
      if (cat.kind !== kind) {
        throw ApiException.badRequest(
          `Category kind (${cat.kind}) does not match payment kind (${kind})`,
        );
      }
    }

    const occurredAt = req.occurredAt ? new Date(req.occurredAt) : new Date();
    const label =
      debt.direction === 'i_owe'
        ? `Borç ödemesi: ${debt.counterparty}`
        : `Tahsilat: ${debt.counterparty}`;

    const saved = await this.dataSource.transaction(async (em) => {
      const txRepo = em.getRepository(FinanceTransaction);
      const debtRepo = em.getRepository(FinanceDebt);

      await txRepo.save(
        txRepo.create({
          ownerId,
          accountId: account.id,
          categoryId: req.categoryId ?? null,
          kind,
          amount: req.amount,
          currency: account.currency,
          occurredAt,
          description: req.description?.trim() || label,
          transferPairId: null,
          debtId: debt.id,
        }),
      );

      debt.paidAmount = Number((alreadyPaid + req.amount).toFixed(2));
      debt.settledAt =
        debt.paidAmount >= principal - 0.001
          ? (debt.settledAt ?? new Date())
          : null;
      return debtRepo.save(debt);
    });

    await this.syncDebtNotification(saved);
    return DebtResponseDto.from(saved);
  }

  /** The payment transactions recorded against a debt, newest first. */
  async listDebtPayments(
    ownerId: string,
    debtId: string,
  ): Promise<TransactionResponseDto[]> {
    await this.requireDebt(ownerId, debtId);
    const rows = await this.transactions.find({
      where: { ownerId, debtId },
      order: { occurredAt: 'DESC', id: 'DESC' },
    });
    return rows.map(TransactionResponseDto.from);
  }

  async deleteDebt(ownerId: string, id: string): Promise<void> {
    const d = await this.requireDebt(ownerId, id);
    await this.notifications.cancelForSource(ownerId, 'debt', d.id);
    await this.debts.softRemove(d);
  }

  // ─── Assets ──────────────────────────────────────────────────────────────

  async listAssets(ownerId: string): Promise<AssetResponseDto[]> {
    const rows = await this.assets.find({
      where: { ownerId },
      order: { position: 'ASC', id: 'ASC' },
    });
    return rows.map(AssetResponseDto.from);
  }

  async createAsset(
    ownerId: string,
    req: AssetRequestDto,
  ): Promise<AssetResponseDto> {
    const a = this.assets.create({
      ownerId,
      name: req.name,
      type: req.type ?? 'other',
      value: req.value,
      currency: req.currency ?? 'TRY',
      acquiredAt: req.acquiredAt ? new Date(req.acquiredAt) : null,
      colorToken: req.colorToken ?? null,
      icon: req.icon ?? null,
      notes: req.notes ?? null,
      position: 0,
    });
    return AssetResponseDto.from(await this.assets.save(a));
  }

  async updateAsset(
    ownerId: string,
    id: string,
    req: AssetRequestDto,
  ): Promise<AssetResponseDto> {
    const a = await this.requireAsset(ownerId, id);
    a.name = req.name;
    if (req.type !== undefined) a.type = req.type;
    a.value = req.value;
    if (req.currency !== undefined) a.currency = req.currency;
    if (req.acquiredAt !== undefined) {
      a.acquiredAt = req.acquiredAt ? new Date(req.acquiredAt) : null;
    }
    if (req.colorToken !== undefined) a.colorToken = req.colorToken ?? null;
    if (req.icon !== undefined) a.icon = req.icon ?? null;
    if (req.notes !== undefined) a.notes = req.notes ?? null;
    return AssetResponseDto.from(await this.assets.save(a));
  }

  async deleteAsset(ownerId: string, id: string): Promise<void> {
    const a = await this.requireAsset(ownerId, id);
    await this.assets.softRemove(a);
  }

  // ─── Loans / installments ──────────────────────────────────────────────────

  async listLoans(ownerId: string): Promise<LoanResponseDto[]> {
    const loans = await this.loans.find({
      where: { ownerId },
      order: { position: 'ASC', id: 'ASC' },
    });
    if (loans.length === 0) return [];
    const allInstallments = await this.installments.find({
      where: { ownerId, loanId: In(loans.map((l) => l.id)) },
      order: { sequence: 'ASC' },
    });
    return loans.map((l) =>
      LoanResponseDto.from(
        l,
        allInstallments.filter((i) => i.loanId === l.id),
      ),
    );
  }

  /**
   * Creates a loan and its full installment schedule (monthly from
   * `startDate`), then enqueues a reminder per installment if a lead-time is
   * set. `interestFree` and a 0% rate are kept consistent.
   */
  async createLoan(
    ownerId: string,
    req: LoanRequestDto,
  ): Promise<LoanResponseDto> {
    const { interestFree, interestRate } = normaliseInterest(req);
    const start = new Date(req.startDate);
    const currency = req.currency ?? 'TRY';

    const result = await this.dataSource.transaction(async (em) => {
      const loanRepo = em.getRepository(FinanceLoan);
      const instRepo = em.getRepository(FinanceInstallment);
      const loan = await loanRepo.save(
        loanRepo.create({
          ownerId,
          name: req.name,
          lender: req.lender ?? null,
          principalAmount: req.principalAmount,
          installmentCount: req.installmentCount,
          installmentAmount: req.installmentAmount,
          interestRate,
          interestFree,
          startDate: start,
          notifyMinutesBefore: req.notifyMinutesBefore ?? null,
          currency,
          notes: req.notes ?? null,
          settledAt: null,
          position: 0,
        }),
      );
      const rows = buildSchedule(
        ownerId,
        loan.id,
        start,
        req.installmentCount,
        req.installmentAmount,
      ).map((r) => instRepo.create(r));
      const saved = await instRepo.save(rows);
      return { loan, installments: saved };
    });

    for (const inst of result.installments) {
      await this.syncInstallmentNotification(result.loan, inst);
    }
    return LoanResponseDto.from(result.loan, result.installments);
  }

  async updateLoan(
    ownerId: string,
    id: string,
    req: LoanRequestDto,
  ): Promise<LoanResponseDto> {
    const loan = await this.requireLoan(ownerId, id);
    const existing = await this.installments.find({
      where: { ownerId, loanId: loan.id },
      order: { sequence: 'ASC' },
    });
    const hasPaid = existing.some((i) => i.paidAt !== null);
    const start = new Date(req.startDate);
    const termsChanged =
      loan.installmentCount !== req.installmentCount ||
      Number(loan.installmentAmount) !== req.installmentAmount ||
      loan.startDate.getTime() !== start.getTime();

    if (termsChanged && hasPaid) {
      throw ApiException.badRequest(
        'Cannot change installment plan after a payment — delete and recreate the loan instead.',
      );
    }

    const { interestFree, interestRate } = normaliseInterest(req);
    loan.name = req.name;
    loan.lender = req.lender ?? null;
    loan.principalAmount = req.principalAmount;
    loan.installmentCount = req.installmentCount;
    loan.installmentAmount = req.installmentAmount;
    loan.interestRate = interestRate;
    loan.interestFree = interestFree;
    loan.startDate = start;
    loan.notifyMinutesBefore = req.notifyMinutesBefore ?? null;
    if (req.currency !== undefined) loan.currency = req.currency;
    loan.notes = req.notes ?? null;

    let installments = existing;
    if (termsChanged) {
      // No payments yet — safe to regenerate the schedule wholesale.
      for (const inst of existing) {
        await this.notifications.cancelForSource(
          ownerId,
          'finance_installment',
          inst.id,
        );
      }
      await this.installments.remove(existing);
      const rows = buildSchedule(
        ownerId,
        loan.id,
        start,
        req.installmentCount,
        req.installmentAmount,
      ).map((r) => this.installments.create(r));
      installments = await this.installments.save(rows);
    }

    loan.settledAt = installments.every((i) => i.paidAt !== null)
      ? (loan.settledAt ?? new Date())
      : null;
    const saved = await this.loans.save(loan);

    // Re-sync notifications (lead-time or dates may have changed).
    for (const inst of installments) {
      await this.syncInstallmentNotification(saved, inst);
    }
    return LoanResponseDto.from(saved, installments);
  }

  async deleteLoan(ownerId: string, id: string): Promise<void> {
    const loan = await this.requireLoan(ownerId, id);
    const rows = await this.installments.find({
      where: { ownerId, loanId: loan.id },
    });
    for (const inst of rows) {
      await this.notifications.cancelForSource(
        ownerId,
        'finance_installment',
        inst.id,
      );
    }
    await this.dataSource.transaction(async (em) => {
      if (rows.length > 0) await em.getRepository(FinanceInstallment).softRemove(rows);
      await em.getRepository(FinanceLoan).softRemove(loan);
    });
  }

  /** Toggle an installment's paid state; recompute loan settlement + reminder. */
  async payInstallment(
    ownerId: string,
    loanId: string,
    installmentId: string,
  ): Promise<LoanResponseDto> {
    const loan = await this.requireLoan(ownerId, loanId);
    const inst = await this.installments.findOne({
      where: { id: installmentId, loanId: loan.id, ownerId },
    });
    if (!inst) throw ApiException.notFound('Installment not found');

    inst.paidAt = inst.paidAt ? null : new Date();
    await this.installments.save(inst);
    await this.syncInstallmentNotification(loan, inst);

    const all = await this.installments.find({
      where: { ownerId, loanId: loan.id },
      order: { sequence: 'ASC' },
    });
    loan.settledAt = all.every((i) => i.paidAt !== null)
      ? (loan.settledAt ?? new Date())
      : null;
    const saved = await this.loans.save(loan);
    return LoanResponseDto.from(saved, all);
  }

  // ─── Summary ─────────────────────────────────────────────────────────────

  /**
   * Returns income/expense totals + by-category breakdown for the given
   * window (defaults to the current calendar month). `accountBalances` is
   * derived from the **full** ledger, not just the window — a balance is a
   * snapshot, not a flow.
   */
  async summary(
    ownerId: string,
    q: SummaryQueryDto,
  ): Promise<SummaryResponseDto> {
    const { from, to } = resolveMonthWindow(q.from, q.to);

    const totalsRaw = await this.transactions
      .createQueryBuilder('t')
      .select('t.kind', 'kind')
      .addSelect('COALESCE(SUM(t.amount), 0)', 'total')
      .where('t.owner_id = :ownerId', { ownerId })
      .andWhere('t.occurred_at BETWEEN :from AND :to', { from, to })
      .andWhere('t.kind IN (:...kinds)', { kinds: ['income', 'expense'] })
      .groupBy('t.kind')
      .getRawMany<{ kind: 'income' | 'expense'; total: string }>();
    const income = Number(
      totalsRaw.find((r) => r.kind === 'income')?.total ?? 0,
    );
    const expense = Number(
      totalsRaw.find((r) => r.kind === 'expense')?.total ?? 0,
    );

    const breakdownRaw = await this.transactions
      .createQueryBuilder('t')
      .leftJoin(FinanceCategory, 'c', 'c.id = t.category_id')
      .select('t.category_id', 'categoryId')
      .addSelect('t.kind', 'kind')
      .addSelect("COALESCE(c.name, '(uncategorised)')", 'categoryName')
      .addSelect('COALESCE(SUM(t.amount), 0)', 'total')
      .where('t.owner_id = :ownerId', { ownerId })
      .andWhere('t.occurred_at BETWEEN :from AND :to', { from, to })
      .andWhere('t.kind IN (:...kinds)', { kinds: ['income', 'expense'] })
      .groupBy('t.category_id, t.kind, c.name')
      .orderBy('total', 'DESC')
      .getRawMany<{
        categoryId: string | null;
        kind: 'income' | 'expense';
        categoryName: string;
        total: string;
      }>();
    const byCategory: CategoryBreakdownEntryDto[] = breakdownRaw.map((r) => ({
      categoryId: r.categoryId,
      categoryName: r.categoryName,
      kind: r.kind,
      total: Number(r.total),
    }));

    const accountList = await this.listAccounts(ownerId);
    const accountBalances = accountList.map((a) => ({
      accountId: a.id,
      name: a.name,
      balance: a.balance,
      currency: a.currency,
    }));

    const upcomingDebts = await this.debts.find({
      where: {
        ownerId,
        settledAt: IsNull(),
        dueAt: Not(IsNull()),
      },
      order: { dueAt: 'ASC' },
      take: 5,
    });

    // ── Net worth ──
    const liveAccountBalance = accountList
      .filter((a) => !a.archived)
      .reduce((sum, a) => sum + a.balance, 0);

    const assetRows = await this.assets.find({ where: { ownerId } });
    const assetTotal = assetRows.reduce((sum, a) => sum + Number(a.value), 0);
    const assetsByTypeMap = new Map<string, number>();
    for (const a of assetRows) {
      assetsByTypeMap.set(
        a.type,
        (assetsByTypeMap.get(a.type) ?? 0) + Number(a.value),
      );
    }
    const assetsByType = [...assetsByTypeMap.entries()]
      .map(([type, total]) => ({ type, total: Number(total.toFixed(2)) }))
      .sort((x, y) => y.total - x.total);

    const totalAssets = liveAccountBalance + assetTotal;

    const owedDebts = await this.debts.find({
      where: { ownerId, direction: 'i_owe', settledAt: IsNull() },
    });
    const debtLiability = owedDebts.reduce(
      (sum, d) => sum + Number(d.principalAmount),
      0,
    );
    const unpaidInstallments = await this.installments.find({
      where: { ownerId, paidAt: IsNull() },
      order: { dueAt: 'ASC' },
    });
    const loanLiability = unpaidInstallments.reduce(
      (sum, i) => sum + Number(i.amount),
      0,
    );
    const totalLiabilities = debtLiability + loanLiability;

    const loanNameById = new Map(
      (await this.loans.find({ where: { ownerId } })).map((l) => [l.id, l.name]),
    );
    const upcomingInstallments: UpcomingInstallmentDto[] = unpaidInstallments
      .slice(0, 5)
      .map((i) => ({
        loanId: i.loanId,
        loanName: loanNameById.get(i.loanId) ?? '',
        installmentId: i.id,
        amount: Number(i.amount),
        dueAt: i.dueAt.toISOString(),
      }));

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      income: Number(income.toFixed(2)),
      expense: Number(expense.toFixed(2)),
      net: Number((income - expense).toFixed(2)),
      byCategory,
      accountBalances,
      upcomingDebts: upcomingDebts.map(DebtResponseDto.from),
      totalAssets: Number(totalAssets.toFixed(2)),
      totalLiabilities: Number(totalLiabilities.toFixed(2)),
      netWorth: Number((totalAssets - totalLiabilities).toFixed(2)),
      assetsByType,
      upcomingInstallments,
    };
  }

  // ─── Internal helpers ────────────────────────────────────────────────────

  private async balanceForAccount(
    ownerId: string,
    accountId: string,
  ): Promise<number> {
    const m = await this.balancesFor(ownerId, [accountId]);
    return m.get(accountId) ?? 0;
  }

  /**
   * Bulk-compute current balances for a set of account ids in a single round
   * trip. `balance = opening_balance + Σ(income/transfer-in) − Σ(expense/transfer-out)`.
   * For transfers the row already lives on the correct account (source row
   * is the source, paired destination row is the destination) — we just
   * decide the sign by `kind` (transfer & on source ⇒ outflow, transfer & on
   * destination ⇒ inflow). Since paired transfer rows are stored as
   * `kind='transfer'` on both sides, we instead infer direction from amount
   * sign convention: we treat the *source* row as the one whose
   * transfer_pair_id points to a row with a *higher* id (created later).
   * Simpler: track both rows separately by joining to the pair; here we
   * approximate by summing amounts with sign derived from a separate query.
   *
   * To keep this simple we encode transfer direction directly in the data:
   * for a transfer, the source side is stored with negative amount and the
   * destination with positive. But our schema stores positive amounts. So
   * here we resolve direction via the pair join.
   */
  private async balancesFor(
    ownerId: string,
    accountIds: string[],
  ): Promise<Map<string, number>> {
    if (accountIds.length === 0) return new Map();

    const accountRows = await this.accounts.find({
      where: { ownerId, id: In(accountIds) },
    });
    const map = new Map<string, number>(
      accountRows.map((a) => [a.id, Number(a.openingBalance)]),
    );

    // income & expense are straightforward.
    const flows = await this.transactions
      .createQueryBuilder('t')
      .select('t.account_id', 'accountId')
      .addSelect('t.kind', 'kind')
      .addSelect('COALESCE(SUM(t.amount), 0)', 'total')
      .where('t.owner_id = :ownerId', { ownerId })
      .andWhere('t.account_id IN (:...accountIds)', { accountIds })
      .andWhere('t.kind IN (:...kinds)', { kinds: ['income', 'expense'] })
      .groupBy('t.account_id, t.kind')
      .getRawMany<{ accountId: string; kind: string; total: string }>();
    for (const r of flows) {
      const sign = r.kind === 'income' ? 1 : -1;
      map.set(r.accountId, (map.get(r.accountId) ?? 0) + sign * Number(r.total));
    }

    // For transfers we need to know which side of the pair each row is on.
    // Convention: within a pair, the row with the LOWER id is the source
    // (we save source first in createTransfer), so it's an outflow on its
    // account; the row with the HIGHER id is the destination (inflow).
    const transfers = await this.transactions
      .createQueryBuilder('t')
      .where('t.owner_id = :ownerId', { ownerId })
      .andWhere('t.account_id IN (:...accountIds)', { accountIds })
      .andWhere('t.kind = :tk', { tk: 'transfer' })
      .andWhere('t.transfer_pair_id IS NOT NULL')
      .getMany();
    for (const t of transfers) {
      const isSource = Number(t.id) < Number(t.transferPairId);
      const sign = isSource ? -1 : 1;
      map.set(t.accountId, (map.get(t.accountId) ?? 0) + sign * Number(t.amount));
    }

    return map;
  }

  private async syncDebtNotification(d: FinanceDebt): Promise<void> {
    await this.notifications.cancelForSource(d.ownerId, 'debt', d.id);
    if (d.settledAt) return;
    const fireAt = leadTimeFireAt(d.dueAt, d.notifyMinutesBefore);
    if (!fireAt || !d.dueAt) return;
    const directionLabel =
      d.direction === 'i_owe'
        ? `Borç vadesi: ${d.counterparty}`
        : `Alacak vadesi: ${d.counterparty}`;
    await this.notifications.enqueue({
      ownerId: d.ownerId,
      kind: 'debt',
      sourceId: d.id,
      scheduledAt: fireAt,
      title: directionLabel,
      body: formatLeadTimeBody(
        d.dueAt,
        d.notifyMinutesBefore ?? 0,
        d.notes ?? `${d.principalAmount} ${d.currency}`,
      ),
      deepLink: '/finance',
    });
  }

  private async requireAccount(
    ownerId: string,
    id: string,
  ): Promise<FinanceAccount> {
    const a = await this.accounts.findOne({ where: { id, ownerId } });
    if (!a) throw ApiException.notFound('Account not found');
    return a;
  }
  private async requireCategory(
    ownerId: string,
    id: string,
  ): Promise<FinanceCategory> {
    const c = await this.categories.findOne({ where: { id, ownerId } });
    if (!c) throw ApiException.notFound('Category not found');
    return c;
  }
  private async requireTransaction(
    ownerId: string,
    id: string,
  ): Promise<FinanceTransaction> {
    const t = await this.transactions.findOne({ where: { id, ownerId } });
    if (!t) throw ApiException.notFound('Transaction not found');
    return t;
  }
  private async requireDebt(
    ownerId: string,
    id: string,
  ): Promise<FinanceDebt> {
    const d = await this.debts.findOne({ where: { id, ownerId } });
    if (!d) throw ApiException.notFound('Debt not found');
    return d;
  }
  private async requireAsset(
    ownerId: string,
    id: string,
  ): Promise<FinanceAsset> {
    const a = await this.assets.findOne({ where: { id, ownerId } });
    if (!a) throw ApiException.notFound('Asset not found');
    return a;
  }
  private async requireLoan(
    ownerId: string,
    id: string,
  ): Promise<FinanceLoan> {
    const l = await this.loans.findOne({ where: { id, ownerId } });
    if (!l) throw ApiException.notFound('Loan not found');
    return l;
  }

  /**
   * Keep an installment's reminder in sync with its state: cancel any existing
   * one, then (re-)enqueue only if the loan has a lead-time and the installment
   * is still unpaid.
   */
  private async syncInstallmentNotification(
    loan: FinanceLoan,
    inst: FinanceInstallment,
  ): Promise<void> {
    await this.notifications.cancelForSource(
      loan.ownerId,
      'finance_installment',
      inst.id,
    );
    if (inst.paidAt) return;
    const fireAt = leadTimeFireAt(inst.dueAt, loan.notifyMinutesBefore);
    if (!fireAt) return;
    await this.notifications.enqueue({
      ownerId: loan.ownerId,
      kind: 'finance_installment',
      sourceId: inst.id,
      scheduledAt: fireAt,
      title: `Taksit vadesi: ${loan.name}`,
      body: formatLeadTimeBody(
        inst.dueAt,
        loan.notifyMinutesBefore ?? 0,
        `${inst.sequence}/${loan.installmentCount} · ${inst.amount} ${loan.currency}`,
      ),
      deepLink: '/finance',
    });
  }
}

/** Coalesce the interest-free flag and rate so a 0% rate ⇒ interest-free. */
export function normaliseInterest(req: {
  interestFree?: boolean;
  interestRate?: number | null;
}): { interestFree: boolean; interestRate: number | null } {
  const interestFree =
    req.interestFree ?? (req.interestRate != null && req.interestRate === 0);
  const interestRate = interestFree ? 0 : (req.interestRate ?? null);
  return { interestFree, interestRate };
}

/** Build a monthly installment schedule starting at `start`. */
export function buildSchedule(
  ownerId: string,
  loanId: string,
  start: Date,
  count: number,
  amount: number,
): Array<{
  ownerId: string;
  loanId: string;
  sequence: number;
  amount: number;
  dueAt: Date;
  paidAt: null;
}> {
  const rows = [];
  for (let k = 0; k < count; k++) {
    rows.push({
      ownerId,
      loanId,
      sequence: k + 1,
      amount,
      dueAt: addMonths(start, k),
      paidAt: null,
    });
  }
  return rows;
}

/** Add `n` months to `d`, clamping the day to the target month's length. */
export function addMonths(d: Date, n: number): Date {
  const result = new Date(d.getTime());
  const targetMonth = result.getMonth() + n;
  result.setDate(1);
  result.setMonth(targetMonth);
  const lastDay = new Date(
    result.getFullYear(),
    result.getMonth() + 1,
    0,
  ).getDate();
  result.setDate(Math.min(d.getDate(), lastDay));
  return result;
}

function resolveMonthWindow(
  fromIso: string | undefined,
  toIso: string | undefined,
): { from: Date; to: Date } {
  if (fromIso && toIso) {
    return { from: new Date(fromIso), to: new Date(toIso) };
  }
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { from, to };
}

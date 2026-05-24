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
import {
  AccountRequestDto,
  AccountResponseDto,
  CategoryBreakdownEntryDto,
  CategoryRequestDto,
  CategoryResponseDto,
  DebtRequestDto,
  DebtResponseDto,
  SummaryQueryDto,
  SummaryResponseDto,
  TransactionListQueryDto,
  TransactionRequestDto,
  TransactionResponseDto,
  TransferRequestDto,
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

  async deleteDebt(ownerId: string, id: string): Promise<void> {
    const d = await this.requireDebt(ownerId, id);
    await this.notifications.cancelForSource(ownerId, 'debt', d.id);
    await this.debts.softRemove(d);
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

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      income: Number(income.toFixed(2)),
      expense: Number(expense.toFixed(2)),
      net: Number((income - expense).toFixed(2)),
      byCategory,
      accountBalances,
      upcomingDebts: upcomingDebts.map(DebtResponseDto.from),
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

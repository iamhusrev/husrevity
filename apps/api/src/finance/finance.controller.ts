import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FinanceService } from './finance.service';
import {
  AccountRequestDto,
  AccountResponseDto,
  AssetRequestDto,
  AssetResponseDto,
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
} from './dto/finance-dtos';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../common/current-user.decorator';

@ApiTags('finance')
@ApiBearerAuth()
@Controller('finance')
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  // ─── Accounts ────────────────────────────────────────────────────────────

  @Get('accounts')
  listAccounts(
    @CurrentUser() u: AuthenticatedUser,
  ): Promise<AccountResponseDto[]> {
    return this.finance.listAccounts(u.userId);
  }

  @Post('accounts')
  @HttpCode(HttpStatus.CREATED)
  createAccount(
    @CurrentUser() u: AuthenticatedUser,
    @Body() body: AccountRequestDto,
  ): Promise<AccountResponseDto> {
    return this.finance.createAccount(u.userId, body);
  }

  @Put('accounts/:id')
  updateAccount(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: AccountRequestDto,
  ): Promise<AccountResponseDto> {
    return this.finance.updateAccount(u.userId, id, body);
  }

  @Delete('accounts/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteAccount(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<void> {
    return this.finance.deleteAccount(u.userId, id);
  }

  // ─── Categories ──────────────────────────────────────────────────────────

  @Get('categories')
  listCategories(
    @CurrentUser() u: AuthenticatedUser,
  ): Promise<CategoryResponseDto[]> {
    return this.finance.listCategories(u.userId);
  }

  @Post('categories')
  @HttpCode(HttpStatus.CREATED)
  createCategory(
    @CurrentUser() u: AuthenticatedUser,
    @Body() body: CategoryRequestDto,
  ): Promise<CategoryResponseDto> {
    return this.finance.createCategory(u.userId, body);
  }

  @Put('categories/:id')
  updateCategory(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: CategoryRequestDto,
  ): Promise<CategoryResponseDto> {
    return this.finance.updateCategory(u.userId, id, body);
  }

  @Delete('categories/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteCategory(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<void> {
    return this.finance.deleteCategory(u.userId, id);
  }

  // ─── Transactions ────────────────────────────────────────────────────────

  @Get('transactions')
  listTransactions(
    @CurrentUser() u: AuthenticatedUser,
    @Query() q: TransactionListQueryDto,
  ): Promise<TransactionResponseDto[]> {
    return this.finance.listTransactions(u.userId, q);
  }

  @Post('transactions')
  @HttpCode(HttpStatus.CREATED)
  createTransaction(
    @CurrentUser() u: AuthenticatedUser,
    @Body() body: TransactionRequestDto,
  ): Promise<TransactionResponseDto> {
    return this.finance.createTransaction(u.userId, body);
  }

  @Put('transactions/:id')
  updateTransaction(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: TransactionRequestDto,
  ): Promise<TransactionResponseDto> {
    return this.finance.updateTransaction(u.userId, id, body);
  }

  @Delete('transactions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteTransaction(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<void> {
    return this.finance.deleteTransaction(u.userId, id);
  }

  @Post('transfers')
  @HttpCode(HttpStatus.CREATED)
  createTransfer(
    @CurrentUser() u: AuthenticatedUser,
    @Body() body: TransferRequestDto,
  ): Promise<{ from: TransactionResponseDto; to: TransactionResponseDto }> {
    return this.finance.createTransfer(u.userId, body);
  }

  // ─── Debts ───────────────────────────────────────────────────────────────

  @Get('debts')
  listDebts(
    @CurrentUser() u: AuthenticatedUser,
    @Query('onlyOpen') onlyOpen?: string,
  ): Promise<DebtResponseDto[]> {
    return this.finance.listDebts(u.userId, onlyOpen === 'true');
  }

  @Post('debts')
  @HttpCode(HttpStatus.CREATED)
  createDebt(
    @CurrentUser() u: AuthenticatedUser,
    @Body() body: DebtRequestDto,
  ): Promise<DebtResponseDto> {
    return this.finance.createDebt(u.userId, body);
  }

  @Put('debts/:id')
  updateDebt(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: DebtRequestDto,
  ): Promise<DebtResponseDto> {
    return this.finance.updateDebt(u.userId, id, body);
  }

  @Patch('debts/:id/settle')
  settleDebt(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<DebtResponseDto> {
    return this.finance.settleDebt(u.userId, id);
  }

  @Post('debts/:id/pay')
  payDebt(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: DebtPaymentRequestDto,
  ): Promise<DebtResponseDto> {
    return this.finance.payDebt(u.userId, id, body);
  }

  @Get('debts/:id/payments')
  listDebtPayments(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<TransactionResponseDto[]> {
    return this.finance.listDebtPayments(u.userId, id);
  }

  @Delete('debts/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteDebt(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<void> {
    return this.finance.deleteDebt(u.userId, id);
  }

  // ─── Assets ──────────────────────────────────────────────────────────────

  @Get('assets')
  listAssets(@CurrentUser() u: AuthenticatedUser): Promise<AssetResponseDto[]> {
    return this.finance.listAssets(u.userId);
  }

  @Post('assets')
  @HttpCode(HttpStatus.CREATED)
  createAsset(
    @CurrentUser() u: AuthenticatedUser,
    @Body() body: AssetRequestDto,
  ): Promise<AssetResponseDto> {
    return this.finance.createAsset(u.userId, body);
  }

  @Put('assets/:id')
  updateAsset(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: AssetRequestDto,
  ): Promise<AssetResponseDto> {
    return this.finance.updateAsset(u.userId, id, body);
  }

  @Delete('assets/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteAsset(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<void> {
    return this.finance.deleteAsset(u.userId, id);
  }

  // ─── Loans / installments ──────────────────────────────────────────────────

  @Get('loans')
  listLoans(@CurrentUser() u: AuthenticatedUser): Promise<LoanResponseDto[]> {
    return this.finance.listLoans(u.userId);
  }

  @Post('loans')
  @HttpCode(HttpStatus.CREATED)
  createLoan(
    @CurrentUser() u: AuthenticatedUser,
    @Body() body: LoanRequestDto,
  ): Promise<LoanResponseDto> {
    return this.finance.createLoan(u.userId, body);
  }

  @Put('loans/:id')
  updateLoan(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: LoanRequestDto,
  ): Promise<LoanResponseDto> {
    return this.finance.updateLoan(u.userId, id, body);
  }

  @Delete('loans/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteLoan(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<void> {
    return this.finance.deleteLoan(u.userId, id);
  }

  @Patch('loans/:id/installments/:installmentId/pay')
  payInstallment(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Param('installmentId') installmentId: string,
  ): Promise<LoanResponseDto> {
    return this.finance.payInstallment(u.userId, id, installmentId);
  }

  // ─── Summary ─────────────────────────────────────────────────────────────

  @Get('summary')
  summary(
    @CurrentUser() u: AuthenticatedUser,
    @Query() q: SummaryQueryDto,
  ): Promise<SummaryResponseDto> {
    return this.finance.summary(u.userId, q);
  }
}

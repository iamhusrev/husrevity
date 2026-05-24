import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FinanceAccount } from './finance-account.entity';
import { FinanceCategory } from './finance-category.entity';
import { FinanceTransaction } from './finance-transaction.entity';
import { FinanceDebt } from './finance-debt.entity';
import { FinanceService } from './finance.service';
import { FinanceController } from './finance.controller';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FinanceAccount,
      FinanceCategory,
      FinanceTransaction,
      FinanceDebt,
    ]),
    NotificationModule,
  ],
  providers: [FinanceService],
  controllers: [FinanceController],
})
export class FinanceModule {}

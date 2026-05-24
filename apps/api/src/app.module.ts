import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { typeOrmConfig } from './config/typeorm.config';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard } from './common/roles.guard';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { NoteModule } from './note/note.module';
import { ListModule } from './list/list.module';
import { ProjectModule } from './project/project.module';
import { TaskModule } from './task/task.module';
import { PlanModule } from './plan/plan.module';
import { CalendarModule } from './calendar/calendar.module';
import { ReminderModule } from './reminder/reminder.module';
import { VaultModule } from './vault/vault.module';
import { GmailModule } from './gmail/gmail.module';
import { AiModule } from './ai/ai.module';
import { CryptoModule } from './crypto/crypto.module';
import { NotificationModule } from './notification/notification.module';
import { TimeBlockModule } from './time-block/time-block.module';
import { FinanceModule } from './finance/finance.module';
import { AdminModule } from './admin/admin.module';
import { HealthController } from './common/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({ useFactory: typeOrmConfig }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    CryptoModule,
    AuthModule,
    UserModule,
    NoteModule,
    ListModule,
    ProjectModule,
    TaskModule,
    PlanModule,
    CalendarModule,
    ReminderModule,
    VaultModule,
    GmailModule,
    AiModule,
    NotificationModule,
    TimeBlockModule,
    FinanceModule,
    AdminModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}

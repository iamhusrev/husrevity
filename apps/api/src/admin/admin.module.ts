import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../user/user.entity';
import { UserInvite } from './user-invite.entity';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { InviteController } from './invite.controller';
import { AuthModule } from '../auth/auth.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, UserInvite]),
    AuthModule,
    NotificationModule,
  ],
  providers: [AdminService],
  controllers: [AdminController, InviteController],
  exports: [AdminService],
})
export class AdminModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Task } from './task.entity';
import { TaskService } from './task.service';
import { TaskController } from './task.controller';
import { ProjectModule } from '../project/project.module';
import { NotificationModule } from '../notification/notification.module';
import { UserModule } from '../user/user.module';
import { ItemMirrorModule } from '../item-mirror/item-mirror.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Task]),
    ProjectModule,
    NotificationModule,
    UserModule,
    ItemMirrorModule,
  ],
  providers: [TaskService],
  controllers: [TaskController],
  exports: [TaskService],
})
export class TaskModule {}

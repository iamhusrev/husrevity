import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TodoList } from './todo-list.entity';
import { ListItem } from './list-item.entity';
import { ListService } from './list.service';
import { ListController } from './list.controller';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([TodoList, ListItem]),
    NotificationModule,
  ],
  providers: [ListService],
  controllers: [ListController],
})
export class ListModule {}

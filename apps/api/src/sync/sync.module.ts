import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Item } from '../item/item.entity';
import { Note } from '../note/note.entity';
import { Project } from '../project/project.entity';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

@Module({
  imports: [TypeOrmModule.forFeature([Item, Note, Project])],
  controllers: [SyncController],
  providers: [SyncService],
})
export class SyncModule {}

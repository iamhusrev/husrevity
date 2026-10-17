import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Item } from '../item/item.entity';
import { ItemOccurrence } from '../item/item-occurrence.entity';
import { Note } from '../note/note.entity';
import { NoteTag } from '../note/note-tag.entity';
import { Project } from '../project/project.entity';
import { Goal } from '../goal/goal.entity';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

@Module({
  imports: [TypeOrmModule.forFeature([Item, ItemOccurrence, Note, NoteTag, Project, Goal])],
  controllers: [SyncController],
  providers: [SyncService],
})
export class SyncModule {}

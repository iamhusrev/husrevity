import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NoteLink } from './note-link.entity';
import { NoteLinkService } from './note-link.service';
import { NoteLinkController } from './note-link.controller';
import { NoteModule } from '../note/note.module';
import { ItemModule } from '../item/item.module';
import { ProjectModule } from '../project/project.module';
import { GoalModule } from '../goal/goal.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([NoteLink]),
    NoteModule,
    ItemModule,
    ProjectModule,
    GoalModule,
  ],
  providers: [NoteLinkService],
  controllers: [NoteLinkController],
  exports: [NoteLinkService],
})
export class NoteLinkModule {}

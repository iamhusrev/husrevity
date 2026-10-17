import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Note } from './note.entity';
import { NoteTag } from './note-tag.entity';
import { NoteService } from './note.service';
import { NoteController } from './note.controller';
import { IdempotencyKey } from '../common/idempotency-key.entity';
import { IdempotencyInterceptor } from '../common/idempotency.interceptor';

@Module({
  imports: [TypeOrmModule.forFeature([Note, NoteTag, IdempotencyKey])],
  providers: [NoteService, IdempotencyInterceptor],
  controllers: [NoteController],
  exports: [NoteService],
})
export class NoteModule {}

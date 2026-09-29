import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { TodayModule } from '../today/today.module';
import { ItemModule } from '../item/item.module';
import { NoteModule } from '../note/note.module';
import { ProjectModule } from '../project/project.module';
import { Item } from '../item/item.entity';
import { Note } from '../note/note.entity';
import { McpController } from './mcp.controller';
import { McpServerFactory } from './mcp-server-factory';
import { McpSearchService } from './mcp-search.service';
import { PatAuthGuard } from './pat-auth.guard';

@Module({
  imports: [
    AuthModule,
    TodayModule,
    ItemModule,
    NoteModule,
    ProjectModule,
    TypeOrmModule.forFeature([Item, Note]),
  ],
  controllers: [McpController],
  providers: [McpServerFactory, McpSearchService, PatAuthGuard],
  exports: [McpServerFactory, McpSearchService],
})
export class McpModule {}

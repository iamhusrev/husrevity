import { IsNotEmpty, IsOptional, MaxLength } from 'class-validator';
import { AiConversation } from '../ai-conversation.entity';
import { AiMessage } from '../ai-message.entity';

export class CreateConversationDto {
  @IsOptional()
  @MaxLength(255)
  title?: string;
}

export class UpdateConversationDto {
  @IsNotEmpty()
  @MaxLength(255)
  title!: string;
}

export class SendMessageDto {
  @IsNotEmpty()
  @MaxLength(8000)
  content!: string;
}

export class ConversationDto {
  id!: string;
  title!: string;
  createdAt!: Date;
  updatedAt!: Date;

  static from(c: AiConversation): ConversationDto {
    return { id: c.id, title: c.title, createdAt: c.createdAt, updatedAt: c.updatedAt };
  }
}

export class MessageDto {
  id!: string;
  conversationId!: string;
  role!: 'user' | 'model';
  content!: string;
  createdAt!: Date;

  static from(m: AiMessage): MessageDto {
    return {
      id: m.id,
      conversationId: m.conversationId,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
    };
  }
}

export class PageDto<T> {
  content!: T[];
  page!: number;
  size!: number;
  total!: number;
  totalPages!: number;
}

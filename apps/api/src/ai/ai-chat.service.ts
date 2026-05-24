import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiConversation } from './ai-conversation.entity';
import { AiMessage } from './ai-message.entity';
import { GeminiConfig } from './gemini.config';
import { ConversationDto, MessageDto, PageDto } from './dto/ai-dtos';
import { ApiException } from '../common/api.exception';
import { ProjectService } from '../project/project.service';
import { PlanService } from '../plan/plan.service';
import { NoteService } from '../note/note.service';

const HISTORY_LIMIT = 20;
const CTX_PROJECTS = 20;
const CTX_PLANS = 20;
const CTX_NOTES = 20;
const NOTE_EXCERPT = 280;
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

@Injectable()
export class AiChatService {
  private readonly logger = new Logger(AiChatService.name);

  constructor(
    @InjectRepository(AiConversation)
    private readonly conversations: Repository<AiConversation>,
    @InjectRepository(AiMessage)
    private readonly messages: Repository<AiMessage>,
    private readonly gemini: GeminiConfig,
    private readonly projects: ProjectService,
    private readonly plans: PlanService,
    private readonly notes: NoteService,
  ) {}

  listConversations(ownerId: string): Promise<ConversationDto[]> {
    return this.conversations
      .find({ where: { ownerId }, order: { updatedAt: 'DESC' } })
      .then((rows) => rows.map(ConversationDto.from));
  }

  async createConversation(ownerId: string, title?: string): Promise<ConversationDto> {
    const c = this.conversations.create({
      ownerId,
      title: (title ?? '').trim() || 'New chat',
    });
    return ConversationDto.from(await this.conversations.save(c));
  }

  async renameConversation(
    ownerId: string,
    id: string,
    title: string,
  ): Promise<ConversationDto> {
    const trimmed = title.trim();
    if (!trimmed) {
      throw ApiException.badRequest('Title cannot be empty');
    }
    const c = await this.requireConversation(ownerId, id);
    c.title = trimmed.slice(0, 255);
    return ConversationDto.from(await this.conversations.save(c));
  }

  async deleteConversation(ownerId: string, id: string): Promise<void> {
    const c = await this.requireConversation(ownerId, id);
    await this.conversations.softRemove(c);
  }

  async listMessages(
    ownerId: string,
    conversationId: string,
    page: number,
    size: number,
  ): Promise<PageDto<MessageDto>> {
    await this.requireConversation(ownerId, conversationId);
    const [rows, total] = await this.messages.findAndCount({
      where: { ownerId, conversationId },
      order: { createdAt: 'ASC' },
      skip: page * size,
      take: size,
    });
    return {
      content: rows.map(MessageDto.from),
      page,
      size,
      total,
      totalPages: Math.ceil(total / size),
    };
  }

  async sendMessage(
    ownerId: string,
    conversationId: string,
    content: string,
  ): Promise<MessageDto> {
    if (!this.gemini.isConfigured()) {
      throw ApiException.badRequest(
        'AI is not configured. Set GOOGLE_GEMINI_API_KEY in apps/api/.env.',
      );
    }
    const conv = await this.requireConversation(ownerId, conversationId);

    const history = await this.messages.find({
      where: { ownerId, conversationId },
      order: { createdAt: 'DESC' },
      take: HISTORY_LIMIT,
    });
    history.reverse();

    const userMsg = await this.messages.save(
      this.messages.create({ ownerId, conversationId, role: 'user', content }),
    );

    const system = await this.buildSystemPrompt(ownerId);
    const replyText = await this.callGemini(system, [
      ...history.map((m) => ({ role: m.role, parts: [{ text: m.content }] })),
      { role: 'user' as const, parts: [{ text: content }] },
    ]);

    const modelMsg = await this.messages.save(
      this.messages.create({
        ownerId,
        conversationId,
        role: 'model',
        content: replyText,
      }),
    );

    // first user line becomes the conversation title
    if (conv.title === 'New chat' && history.length === 0) {
      conv.title = content.slice(0, 80);
    }
    conv.updatedAt = new Date();
    await this.conversations.save(conv);

    void userMsg;
    return MessageDto.from(modelMsg);
  }

  private async buildSystemPrompt(ownerId: string): Promise<string> {
    const [projects, plans, notes] = await Promise.all([
      this.projects.list(ownerId).catch(() => []),
      this.plans.list(ownerId).catch(() => []),
      this.notes.list(ownerId, undefined, undefined, false).catch(() => []),
    ]);

    const lines: string[] = [
      'You are the user\'s personal productivity assistant inside the husrevity app.',
      'Answer concisely and in the user\'s language. Use the context below about',
      'their own projects, plans and notes when relevant. Do not invent data.',
      '',
    ];

    if (projects.length) {
      lines.push('## Projects');
      for (const p of projects.slice(0, CTX_PROJECTS)) {
        lines.push(`- [${p.code}] ${p.name} (${p.status})${p.description ? ` — ${p.description}` : ''}`);
      }
      lines.push('');
    }
    if (plans.length) {
      lines.push('## Plans');
      for (const pl of plans.slice(0, CTX_PLANS)) {
        lines.push(
          `- ${pl.title} (${pl.status ?? 'ACTIVE'})${pl.targetDate ? ` — target ${pl.targetDate}` : ''}`,
        );
      }
      lines.push('');
    }
    if (notes.length) {
      lines.push('## Notes');
      for (const n of notes.slice(0, CTX_NOTES)) {
        const body = (n.bodyMarkdown ?? '').replace(/\s+/g, ' ').slice(0, NOTE_EXCERPT);
        lines.push(`- ${n.title}${body ? `: ${body}` : ''}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  private async callGemini(
    system: string,
    contents: { role: 'user' | 'model'; parts: { text: string }[] }[],
  ): Promise<string> {
    const url = `${GEMINI_URL}/${this.gemini.model}:generateContent?key=${this.gemini.apiKey}`;
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents,
        }),
      });
      const json = (await r.json()) as Record<string, unknown>;
      if (!r.ok) {
        throw new Error(`HTTP ${r.status}: ${JSON.stringify(json).slice(0, 200)}`);
      }
      const candidates = (json.candidates as
        | { content?: { parts?: { text?: string }[] } }[]
        | undefined) ?? [];
      const text = candidates[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
      return text || '(no response)';
    } catch (e) {
      this.logger.error('Gemini call failed', e as Error);
      throw ApiException.badRequest(`AI request failed: ${(e as Error).message}`);
    }
  }

  private async requireConversation(ownerId: string, id: string): Promise<AiConversation> {
    const c = await this.conversations.findOne({ where: { id, ownerId } });
    if (!c) throw ApiException.notFound('Conversation not found');
    return c;
  }
}

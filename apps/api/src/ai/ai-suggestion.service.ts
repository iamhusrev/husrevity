import { Injectable, Logger } from '@nestjs/common';
import { ApiException } from '../common/api.exception';
import { GeminiConfig } from './gemini.config';
import { NoteService } from '../note/note.service';
import { ReminderService } from '../reminder/reminder.service';
import { PlanService } from '../plan/plan.service';
import { ProjectService } from '../project/project.service';
import { TaskService } from '../task/task.service';
import {
  SuggestionItemDto,
  SuggestionMode,
  SuggestionsRequestDto,
} from './dto/suggestion-dtos';
import { parseSuggestions, ParseContext } from './suggestion-parser';

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const CACHE_TTL_MS = 5 * 60_000;
// Soft caps so the prompt stays well under the model's context budget.
const CTX_NOTES = 20;
const CTX_REMINDERS = 20;
const CTX_PLANS = 10;
const CTX_PROJECTS = 10;
const CTX_TASKS_PER_PROJECT = 5;
const CTX_TASKS_TOTAL = 20;
const NOTE_EXCERPT = 140;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

type GatheredContext = {
  notes: { id: string; title: string; excerpt: string; updatedAt: string }[];
  reminders: { id: string; title: string; dueAt: string | null; priority: string }[];
  plans: { id: string; title: string; status: string; targetDate: string | null }[];
  projects: { id: string; code: string; name: string; status: string }[];
  tasks: {
    id: string;
    projectCode: string;
    title: string;
    status: string;
    priority: string;
    dueAt: string | null;
  }[];
};

@Injectable()
export class AiSuggestionService {
  private readonly logger = new Logger(AiSuggestionService.name);
  private readonly cache = new Map<
    string,
    { value: SuggestionItemDto[]; expiresAt: number }
  >();

  constructor(
    private readonly gemini: GeminiConfig,
    private readonly notes: NoteService,
    private readonly reminders: ReminderService,
    private readonly plans: PlanService,
    private readonly projects: ProjectService,
    private readonly tasks: TaskService,
  ) {}

  async suggest(
    ownerId: string,
    req: SuggestionsRequestDto,
  ): Promise<SuggestionItemDto[]> {
    if (!this.gemini.isConfigured()) {
      throw ApiException.badRequest(
        'AI is not configured. Set GOOGLE_GEMINI_API_KEY in apps/api/.env.',
      );
    }

    const mode = req.mode;
    const count = (req.count ?? 3) as 1 | 3;

    const context = await this.gatherContext(ownerId);
    const ctxHash = this.contextHash(context);
    const key = `${ownerId}:${mode}:${count}:${ctxHash}`;

    const hit = this.cache.get(key);
    if (hit && hit.expiresAt > Date.now()) {
      return hit.value;
    }

    const system = this.buildSystem(mode, count);
    const user = this.buildUserPrompt(context);
    const raw = await this.callGeminiJson(system, user);
    const parseCtx: ParseContext = { validIds: this.buildValidIds(context) };
    const parsed = parseSuggestions(raw, count, parseCtx);

    this.cache.set(key, { value: parsed, expiresAt: Date.now() + CACHE_TTL_MS });
    this.evictExpired();
    return parsed;
  }

  private buildValidIds(c: GatheredContext): Set<string> {
    return new Set<string>([
      ...c.notes.map((x) => `note:${x.id}`),
      ...c.reminders.map((x) => `reminder:${x.id}`),
      ...c.plans.map((x) => `plan:${x.id}`),
      ...c.projects.map((x) => `project:${x.id}`),
      ...c.tasks.map((x) => `task:${x.id}`),
    ]);
  }

  // ─── context gather (RAG-lite, no embeddings) ──────────────────────────────

  private async gatherContext(ownerId: string): Promise<GatheredContext> {
    const [noteRows, reminderLists, planRows, projectRows] = await Promise.all([
      this.notes.list(ownerId, undefined, undefined, false),
      this.reminders.listReminderLists(ownerId),
      this.plans.list(ownerId),
      this.projects.list(ownerId),
    ]);

    // Reminders: all open across every list.
    const reminderRows = (
      await Promise.all(
        reminderLists.map((l) =>
          this.reminders.listReminders(ownerId, l.id, false),
        ),
      )
    ).flat();

    // Tasks: top-K per project, capped overall.
    const taskRows = (
      await Promise.all(
        projectRows
          .filter((p) => p.status !== 'ARCHIVED' && p.status !== 'CANCELLED')
          .map((p) => this.tasks.listForProject(ownerId, p.code).catch(() => [])),
      )
    ).flat();

    const now = Date.now();

    const notes = [...noteRows]
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      )
      .slice(0, CTX_NOTES)
      .map((n) => ({
        id: n.id,
        title: n.title,
        excerpt: (n.bodyMarkdown ?? '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, NOTE_EXCERPT),
        updatedAt: n.updatedAt.toISOString(),
      }));

    const reminders = reminderRows
      .filter((r) => {
        if (!r.dueAt) return true; // open without due → still relevant
        const due = new Date(r.dueAt).getTime();
        return due - now <= WEEK_MS; // overdue + this week
      })
      .sort((a, b) => {
        const ax = a.dueAt
          ? new Date(a.dueAt).getTime()
          : Number.MAX_SAFE_INTEGER;
        const bx = b.dueAt
          ? new Date(b.dueAt).getTime()
          : Number.MAX_SAFE_INTEGER;
        return ax - bx;
      })
      .slice(0, CTX_REMINDERS)
      .map((r) => ({
        id: r.id,
        title: r.title,
        dueAt: r.dueAt ? new Date(r.dueAt).toISOString() : null,
        priority: r.priority,
      }));

    const plans = planRows
      .filter((p) => p.status !== 'DONE' && p.status !== 'CANCELLED')
      .slice(0, CTX_PLANS)
      .map((p) => ({
        id: p.id,
        title: p.title,
        status: p.status,
        targetDate: p.targetDate,
      }));

    const projects = projectRows
      .filter((p) => p.status !== 'ARCHIVED' && p.status !== 'CANCELLED')
      .slice(0, CTX_PROJECTS)
      .map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        status: p.status,
      }));

    const projectCodeById = new Map(projectRows.map((p) => [p.id, p.code]));
    const tasks = taskRows
      .filter((t) => t.status === 'TODO' || t.status === 'IN_PROGRESS')
      .sort((a, b) => {
        const ax = a.dueAt
          ? new Date(a.dueAt).getTime()
          : Number.MAX_SAFE_INTEGER;
        const bx = b.dueAt
          ? new Date(b.dueAt).getTime()
          : Number.MAX_SAFE_INTEGER;
        return ax - bx;
      })
      .slice(0, CTX_TASKS_TOTAL)
      .map((t) => ({
        id: t.id,
        projectCode: t.projectId
          ? (projectCodeById.get(t.projectId) ?? '')
          : '',
        title: t.title,
        status: t.status,
        priority: t.priority,
        dueAt: t.dueAt ? new Date(t.dueAt).toISOString() : null,
      }));

    // Trim tasks-per-project after the global cap, keep variety.
    const seenPerProject = new Map<string, number>();
    const trimmedTasks = tasks.filter((t) => {
      const k = t.projectCode || '_none';
      const n = (seenPerProject.get(k) ?? 0) + 1;
      seenPerProject.set(k, n);
      return n <= CTX_TASKS_PER_PROJECT;
    });

    return { notes, reminders, plans, projects, tasks: trimmedTasks };
  }

  private contextHash(c: GatheredContext): string {
    // Cheap, deterministic — enough to bust cache when items change meaningfully.
    const id = (arr: { id: string }[]) => arr.map((x) => x.id).join(',');
    const parts = [
      `n:${c.notes.length}:${id(c.notes)}`,
      `r:${c.reminders.length}:${id(c.reminders)}`,
      `p:${c.plans.length}:${id(c.plans)}`,
      `pr:${c.projects.length}:${id(c.projects)}`,
      `t:${c.tasks.length}:${id(c.tasks)}`,
    ];
    let h = 0;
    const s = parts.join('|');
    for (let i = 0; i < s.length; i++) {
      h = (h * 31 + s.charCodeAt(i)) | 0;
    }
    return h.toString(36);
  }

  // ─── prompt ────────────────────────────────────────────────────────────────

  private buildSystem(mode: SuggestionMode, count: 1 | 3): string {
    const modeLine =
      mode === 'task'
        ? 'The user wants concrete things to GET DONE — actionable, time-bounded, ideally tied to a real item in the context.'
        : 'The user wants a LEISURE / HOBBY suggestion — something restorative. If the context shows heavy load (overdue items, many tasks), lean lighter and shorter.';

    return [
      'You are the user\'s personal productivity assistant inside a self-hosted app.',
      `Return EXACTLY ${count} suggestion${count === 1 ? '' : 's'} as a JSON array. No prose. No markdown fences.`,
      modeLine,
      'Each item: { "title": string, "description": string, "kind": "task"|"hobby"|"mixed", "sourceRef": { "type": "reminder"|"task"|"note"|"plan"|"project", "id": string } | null, "reasonShort": string }',
      'Rules:',
      '- title ≤ 80 chars, imperative, single line.',
      '- description ≤ 220 chars, 1–2 sentences, second person.',
      '- reasonShort ≤ 120 chars, explain WHY this surfaces NOW (e.g. "Due in 2 days", "Stalled 3 weeks", "You have unfinished plan items").',
      '- If a task-mode suggestion derives from a real item in the context, set sourceRef to that item\'s exact id and type. Otherwise sourceRef = null.',
      '- Hobby-mode sourceRef is usually null.',
      '- Respond in the same language as the user content (Turkish if the context titles are predominantly Turkish, otherwise English). Prefer Turkish on tie.',
      '- Never invent ids that are not in the context.',
    ].join('\n');
  }

  private buildUserPrompt(c: GatheredContext): string {
    const lines: string[] = [];
    lines.push('=== CONTEXT ===');
    lines.push(`now: ${new Date().toISOString()}`);

    lines.push(`\n[reminders ${c.reminders.length}]`);
    for (const r of c.reminders) {
      lines.push(
        `- id=${r.id} prio=${r.priority} due=${r.dueAt ?? '-'} :: ${r.title}`,
      );
    }

    lines.push(`\n[tasks ${c.tasks.length}]`);
    for (const t of c.tasks) {
      lines.push(
        `- id=${t.id} project=${t.projectCode} status=${t.status} prio=${t.priority} due=${t.dueAt ?? '-'} :: ${t.title}`,
      );
    }

    lines.push(`\n[plans ${c.plans.length}]`);
    for (const p of c.plans) {
      lines.push(
        `- id=${p.id} status=${p.status} target=${p.targetDate ?? '-'} :: ${p.title}`,
      );
    }

    lines.push(`\n[projects ${c.projects.length}]`);
    for (const p of c.projects) {
      lines.push(`- id=${p.id} code=${p.code} status=${p.status} :: ${p.name}`);
    }

    lines.push(`\n[notes ${c.notes.length}]`);
    for (const n of c.notes) {
      lines.push(
        `- id=${n.id} updated=${n.updatedAt} :: ${n.title}${n.excerpt ? ` — ${n.excerpt}` : ''}`,
      );
    }

    lines.push('\n=== END CONTEXT ===');
    lines.push('Return the JSON array now.');
    return lines.join('\n');
  }

  // ─── gemini call (JSON mime) ───────────────────────────────────────────────

  private async callGeminiJson(system: string, user: string): Promise<string> {
    const url = `${GEMINI_URL}/${this.gemini.model}:generateContent?key=${this.gemini.apiKey}`;
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.7,
            maxOutputTokens: 1024,
          },
        }),
      });
      const json = (await r.json()) as Record<string, unknown>;
      if (!r.ok) {
        throw new Error(`HTTP ${r.status}: ${JSON.stringify(json).slice(0, 200)}`);
      }
      const candidates =
        (json.candidates as
          | { content?: { parts?: { text?: string }[] } }[]
          | undefined) ?? [];
      const text =
        candidates[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
      if (!text) throw new Error('empty response');
      return text;
    } catch (e) {
      this.logger.error('Gemini suggestion call failed', e as Error);
      throw ApiException.badRequest(
        `AI request failed: ${(e as Error).message}`,
      );
    }
  }

  private evictExpired(): void {
    const now = Date.now();
    for (const [k, v] of this.cache) {
      if (v.expiresAt <= now) this.cache.delete(k);
    }
  }
}

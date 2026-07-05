import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SportSession } from './entities/sport-session.entity';
import { GeminiConfig } from '../ai/gemini.config';
import { ApiException } from '../common/api.exception';
import { SportProfileService } from './sport-profile.service';
import { SportProgramService } from './sport-program.service';
import { GenerateAiProgramDto } from './dto/sport-shared.dto';
import { ProgramResponseDto } from './dto/sport-program.dto';
import { SessionResponseDto } from './dto/sport-session.dto';
import { parseAiProgram } from './sport-ai-parser';

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

@Injectable()
export class SportAiService {
  private readonly logger = new Logger(SportAiService.name);

  constructor(
    private readonly gemini: GeminiConfig,
    private readonly profiles: SportProfileService,
    private readonly programs: SportProgramService,
    @InjectRepository(SportSession)
    private readonly sessionRepo: Repository<SportSession>,
  ) {}

  /**
   * Generates a multi-week workout program via Gemini and persists it as a
   * new {@link SportProgram} with its {@link SportSession} rows.
   */
  async generateProgram(
    ownerId: string,
    profileId: string,
    config: GenerateAiProgramDto,
  ): Promise<ProgramResponseDto> {
    if (!this.gemini.isConfigured()) {
      throw ApiException.badRequest(
        'AI is not configured. Set GOOGLE_GEMINI_API_KEY in apps/api/.env.',
      );
    }

    const profile = await this.profiles.getOrCreate(ownerId);
    if (profile.id !== profileId) {
      throw ApiException.notFound('Sport profile not found');
    }

    // Pulled for future context-aware prompting (avoid duplicate programs);
    // not currently embedded in the prompt beyond existence checks.
    await this.programs.listPrograms(ownerId, true);

    const system = this.buildSystemPrompt(profile, config);
    const user = 'Generate the program now. Return the JSON array only.';
    const raw = await this.callGeminiJson(system, user);
    const weeks = parseAiProgram(raw);

    const createdProgram = await this.programs.createProgram(ownerId, {
      name: `${profile.fitnessLevel} Training - Week 1 of ${config.weekCount}`,
      weekCount: config.weekCount,
      programType: 'WEEKLY',
      startDate: new Date().toISOString().slice(0, 10),
      aiGenerated: true,
    });

    const sessionEntities: SportSession[] = [];
    for (const week of weeks) {
      week.sessions.forEach((s, index) => {
        sessionEntities.push(
          this.sessionRepo.create({
            programId: createdProgram.id,
            activityType: s.activityType,
            location: s.location,
            name: s.name,
            plannedDayOfWeek: s.dayOfWeek,
            plannedDuration: s.duration,
            difficulty: s.difficulty,
            description: s.description,
            position: index,
          }),
        );
      });
    }
    const savedSessions = sessionEntities.length
      ? await this.sessionRepo.save(sessionEntities)
      : [];

    return { ...createdProgram, sessions: savedSessions.map(SessionResponseDto.from) };
  }

  private buildSystemPrompt(
    profile: { fitnessLevel: string; weeklyHours: number; goals: string | null; notes: string | null },
    config: GenerateAiProgramDto,
  ): string {
    return [
      'You are a professional fitness coach. Generate a '
        + `${config.weekCount}-week personalized workout program based on the user's `
        + 'profile and constraints.',
      '',
      'User Profile:',
      `- Fitness Level: ${profile.fitnessLevel}`,
      `- Target Weekly Hours: ${config.targetWeeklyHours}`,
      `- Preferred Activities: ${config.activityPreferences.join(', ')}`,
      `- Goals: ${profile.goals ?? '-'}`,
      `- Constraints: ${profile.notes ?? '-'}`,
      '',
      `For EACH week in the ${config.weekCount}-week program, generate 4-5 workout sessions.`,
      'Each session must specify:',
      '1. Activity type (one of: RUNNING, YOGA, SWIMMING, STRENGTH, GYM, CYCLING, FOOTBALL)',
      '2. Location (EV for home, SALON for gym, YÜZME for pool, DIS for outdoor)',
      '3. Session name (short, English)',
      '4. Planned day of week (0=Monday, 6=Sunday)',
      '5. Duration in minutes',
      '6. Difficulty (EASY, MODERATE, HARD)',
      '7. Detailed description (warm-up, main workout, cool-down steps)',
      '',
      'Ensure: total weekly hours ≈ target, variety of activities, progressive difficulty.',
      'Include at least 1 rest day per week.',
      '',
      'Output MUST be valid JSON ONLY (no markdown, no code blocks).',
      'Format: array of week objects.',
      '',
      '[',
      '  {',
      '    "weekNumber": 1,',
      '    "sessions": [',
      '      {',
      '        "activityType": "RUNNING",',
      '        "location": "DIS",',
      '        "name": "Foundation Run",',
      '        "dayOfWeek": 0,',
      '        "duration": 30,',
      '        "difficulty": "EASY",',
      '        "description": "Easy 30-min run. 5-min warm-up jog, 20-min steady pace (conversational), 5-min cool-down walk."',
      '      }',
      '    ]',
      '  }',
      ']',
    ].join('\n');
  }

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
            maxOutputTokens: 4096,
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
      // Detail stays server-side; the client only ever sees a generic message.
      this.logger.error('Gemini sport program generation failed', e as Error);
      throw ApiException.badRequest(
        'AI program generation failed. Please try again in a moment.',
      );
    }
  }
}

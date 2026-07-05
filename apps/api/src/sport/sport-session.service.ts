import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { SportSession } from './entities/sport-session.entity';
import { SportProgramService } from './sport-program.service';
import { ApiException } from '../common/api.exception';
import {
  SessionRequestDto,
  SessionResponseDto,
  SessionReorderItemDto,
  SessionUpdateRequestDto,
} from './dto/sport-session.dto';

@Injectable()
export class SportSessionService {
  constructor(
    @InjectRepository(SportSession)
    private readonly sessions: Repository<SportSession>,
    private readonly programs: SportProgramService,
    private readonly dataSource: DataSource,
  ) {}

  async listSessions(ownerId: string, programId: string): Promise<SessionResponseDto[]> {
    const program = await this.programs.requireProgram(ownerId, programId);
    const rows = await this.sessions.find({
      where: { programId: program.id },
      order: { position: 'ASC' },
    });
    return rows.map(SessionResponseDto.from);
  }

  async getSession(ownerId: string, id: string): Promise<SessionResponseDto> {
    return SessionResponseDto.from(await this.requireSession(ownerId, id));
  }

  async createSession(
    ownerId: string,
    programId: string,
    req: SessionRequestDto,
  ): Promise<SessionResponseDto> {
    const program = await this.programs.requireProgram(ownerId, programId);
    const session = this.sessions.create({
      programId: program.id,
      activityType: req.activityType,
      location: req.location,
      name: req.name,
      plannedDayOfWeek: req.plannedDayOfWeek,
      plannedDuration: req.plannedDuration,
      difficulty: req.difficulty,
      description: req.description,
      position: await this.nextPosition(program.id),
    });
    return SessionResponseDto.from(await this.sessions.save(session));
  }

  async updateSession(
    ownerId: string,
    id: string,
    req: SessionUpdateRequestDto,
  ): Promise<SessionResponseDto> {
    const session = await this.requireSession(ownerId, id);
    // programId is intentionally not on SessionUpdateRequestDto — immutable once created.
    if (req.activityType !== undefined) session.activityType = req.activityType;
    if (req.location !== undefined) session.location = req.location;
    if (req.name !== undefined) session.name = req.name;
    if (req.plannedDayOfWeek !== undefined) session.plannedDayOfWeek = req.plannedDayOfWeek;
    if (req.plannedDuration !== undefined) session.plannedDuration = req.plannedDuration;
    if (req.difficulty !== undefined) session.difficulty = req.difficulty;
    if (req.description !== undefined) session.description = req.description;
    return SessionResponseDto.from(await this.sessions.save(session));
  }

  async deleteSession(ownerId: string, id: string): Promise<void> {
    const session = await this.requireSession(ownerId, id);
    await this.sessions.softRemove(session);
  }

  async reorderSessions(
    ownerId: string,
    programId: string,
    items: SessionReorderItemDto[],
  ): Promise<void> {
    const program = await this.programs.requireProgram(ownerId, programId);
    if (!items.length) return;

    const ids = items.map((i) => i.id);
    if (new Set(ids).size !== ids.length) {
      throw ApiException.badRequest('Reorder items contain duplicate ids');
    }
    const positions = items.map((i) => i.position).sort((a, b) => a - b);
    const expected = Array.from({ length: items.length }, (_, i) => i);
    const isConsecutiveFromZero = positions.every((p, i) => p === expected[i]);
    if (!isConsecutiveFromZero) {
      throw ApiException.badRequest(
        'Reorder positions must be a gap-free sequence starting at 0',
      );
    }

    const owned = await this.sessions.find({ where: { programId: program.id } });
    const ownedIds = new Set(owned.map((s) => s.id));
    if (!ids.every((id) => ownedIds.has(id))) {
      throw ApiException.badRequest('Reorder items reference an unknown session');
    }

    await this.dataSource.transaction(async (em) => {
      for (const it of items) {
        await em
          .createQueryBuilder()
          .update(SportSession)
          .set({ position: it.position })
          .where('id = :id AND program_id = :programId', {
            id: it.id,
            programId: program.id,
          })
          .execute();
      }
    });
  }

  /** Loads a session and verifies its parent program belongs to the owner, or throws 404. */
  async requireSession(ownerId: string, id: string): Promise<SportSession> {
    const session = await this.sessions.findOne({ where: { id } });
    if (!session || !session.programId) throw ApiException.notFound('Sport session not found');
    try {
      await this.programs.requireProgram(ownerId, session.programId);
    } catch {
      // Normalize to a single message so callers can't distinguish "no such
      // session" from "session belongs to a program you don't own".
      throw ApiException.notFound('Sport session not found');
    }
    return session;
  }

  private async nextPosition(programId: string): Promise<number> {
    const last = await this.sessions.findOne({
      where: { programId },
      order: { position: 'DESC' },
    });
    return last ? last.position + 1 : 0;
  }
}

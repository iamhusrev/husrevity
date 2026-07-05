import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { SportProgram } from './entities/sport-program.entity';
import { SportSession } from './entities/sport-session.entity';
import { ApiException } from '../common/api.exception';
import {
  ProgramRequestDto,
  ProgramResponseDto,
  ProgramUpdateRequestDto,
} from './dto/sport-program.dto';
import { SessionResponseDto } from './dto/sport-session.dto';

@Injectable()
export class SportProgramService {
  constructor(
    @InjectRepository(SportProgram)
    private readonly programs: Repository<SportProgram>,
    @InjectRepository(SportSession)
    private readonly sessions: Repository<SportSession>,
  ) {}

  async listPrograms(ownerId: string, activeOnly?: boolean): Promise<ProgramResponseDto[]> {
    const where = activeOnly ? { ownerId, isActive: true } : { ownerId };
    const rows = await this.programs.find({ where, order: { updatedAt: 'DESC' } });
    if (!rows.length) return [];

    const sessionRows = await this.sessions.find({
      where: { programId: In(rows.map((p) => p.id)) },
      order: { position: 'ASC' },
    });
    const byProgram = new Map<string, SessionResponseDto[]>();
    for (const s of sessionRows) {
      if (!s.programId) continue;
      const list = byProgram.get(s.programId) ?? [];
      list.push(SessionResponseDto.from(s));
      byProgram.set(s.programId, list);
    }

    return rows.map((p) => ProgramResponseDto.from(p, byProgram.get(p.id) ?? []));
  }

  async getProgram(ownerId: string, id: string): Promise<ProgramResponseDto> {
    const program = await this.requireProgram(ownerId, id);
    const sessionRows = await this.sessions.find({
      where: { programId: program.id },
      order: { position: 'ASC' },
    });
    return ProgramResponseDto.from(program, sessionRows.map(SessionResponseDto.from));
  }

  async createProgram(ownerId: string, req: ProgramRequestDto): Promise<ProgramResponseDto> {
    const program = this.programs.create({
      ownerId,
      name: req.name,
      description: req.description ?? null,
      weekCount: req.weekCount,
      programType: req.programType,
      aiGenerated: req.aiGenerated ?? false,
      startDate: req.startDate,
      endDate: req.endDate ?? null,
      isActive: true,
    });
    const saved = await this.programs.save(program);
    return ProgramResponseDto.from(saved, []);
  }

  async updateProgram(
    ownerId: string,
    id: string,
    req: ProgramUpdateRequestDto,
  ): Promise<ProgramResponseDto> {
    const program = await this.requireProgram(ownerId, id);
    if (req.name !== undefined) program.name = req.name;
    if (req.description !== undefined) program.description = req.description ?? null;
    if (req.weekCount !== undefined) program.weekCount = req.weekCount;
    if (req.programType !== undefined) program.programType = req.programType;
    if (req.aiGenerated !== undefined) program.aiGenerated = req.aiGenerated;
    if (req.startDate !== undefined) program.startDate = req.startDate;
    if (req.endDate !== undefined) program.endDate = req.endDate ?? null;
    const saved = await this.programs.save(program);
    const sessionRows = await this.sessions.find({
      where: { programId: saved.id },
      order: { position: 'ASC' },
    });
    return ProgramResponseDto.from(saved, sessionRows.map(SessionResponseDto.from));
  }

  async deleteProgram(ownerId: string, id: string): Promise<void> {
    const program = await this.requireProgram(ownerId, id);
    const sessionRows = await this.sessions.find({ where: { programId: program.id } });
    if (sessionRows.length) await this.sessions.softRemove(sessionRows);
    await this.programs.softRemove(program);
  }

  async activateProgram(
    ownerId: string,
    id: string,
    isActive: boolean,
  ): Promise<ProgramResponseDto> {
    const program = await this.requireProgram(ownerId, id);
    program.isActive = isActive;
    const saved = await this.programs.save(program);
    const sessionRows = await this.sessions.find({
      where: { programId: saved.id },
      order: { position: 'ASC' },
    });
    return ProgramResponseDto.from(saved, sessionRows.map(SessionResponseDto.from));
  }

  /** Loads a program the caller owns, or throws 404. Used by SportSessionService too. */
  async requireProgram(ownerId: string, id: string): Promise<SportProgram> {
    const program = await this.programs.findOne({ where: { id, ownerId } });
    if (!program) throw ApiException.notFound('Sport program not found');
    return program;
  }
}

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SportProfile } from './entities/sport-profile.entity';
import { ProfileRequestDto, ProfileResponseDto } from './dto/sport-profile.dto';

/** Static catalogue surfaced to the web app for activity pickers. */
const AVAILABLE_ACTIVITIES = [
  'RUNNING',
  'YOGA',
  'SWIMMING',
  'STRENGTH',
  'GYM',
  'CYCLING',
  'FOOTBALL',
  'CUSTOM',
] as const;

@Injectable()
export class SportProfileService {
  constructor(
    @InjectRepository(SportProfile)
    private readonly profiles: Repository<SportProfile>,
  ) {}

  /** Loads the owner's sport profile, lazily creating a sensible default. */
  async getOrCreate(ownerId: string): Promise<ProfileResponseDto> {
    let profile = await this.profiles.findOne({ where: { ownerId } });
    if (!profile) {
      profile = this.profiles.create({
        ownerId,
        fitnessLevel: 'beginner',
        weeklyHours: 5,
        preferredActivities: [],
        goals: null,
        notes: null,
      });
      profile = await this.profiles.save(profile);
    }
    return ProfileResponseDto.from(profile);
  }

  async update(ownerId: string, req: ProfileRequestDto): Promise<ProfileResponseDto> {
    let profile = await this.profiles.findOne({ where: { ownerId } });
    if (!profile) {
      profile = this.profiles.create({
        ownerId,
        fitnessLevel: 'beginner',
        weeklyHours: 5,
        preferredActivities: [],
        goals: null,
        notes: null,
      });
    }
    if (req.fitnessLevel !== undefined) profile.fitnessLevel = req.fitnessLevel;
    if (req.weeklyHours !== undefined) profile.weeklyHours = req.weeklyHours;
    if (req.preferredActivities !== undefined) {
      profile.preferredActivities = req.preferredActivities;
    }
    if (req.goals !== undefined) profile.goals = req.goals ?? null;
    if (req.notes !== undefined) profile.notes = req.notes ?? null;
    return ProfileResponseDto.from(await this.profiles.save(profile));
  }

  getAvailableActivities(): string[] {
    return [...AVAILABLE_ACTIVITIES];
  }
}

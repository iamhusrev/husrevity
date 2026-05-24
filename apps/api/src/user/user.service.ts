import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './user.entity';
import { ApiException } from '../common/api.exception';
import {
  ChangePasswordDto,
  NotificationPreferencesDto,
  UpdateProfileDto,
} from './user.dto';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  findById(id: string): Promise<User | null> {
    return this.users.findOne({ where: { id } });
  }

  async requireById(id: string): Promise<User> {
    const u = await this.findById(id);
    if (!u) throw ApiException.notFound('User not found');
    return u;
  }

  findByEmail(email: string): Promise<User | null> {
    return this.users.findOne({ where: { email: email.toLowerCase() } });
  }

  async updateProfile(id: string, dto: UpdateProfileDto): Promise<User> {
    const u = await this.requireById(id);
    if (dto.firstName !== undefined) u.firstName = dto.firstName.trim() || null;
    if (dto.lastName !== undefined) u.lastName = dto.lastName.trim() || null;
    return this.users.save(u);
  }

  async changePassword(id: string, dto: ChangePasswordDto): Promise<void> {
    const u = await this.requireById(id);
    const ok = await bcrypt.compare(dto.currentPassword, u.passwordHash);
    if (!ok) throw ApiException.badRequest('Current password is incorrect');
    u.passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.users.save(u);
  }

  async updateNotificationPreferences(
    id: string,
    dto: NotificationPreferencesDto,
  ): Promise<User> {
    const u = await this.requireById(id);
    if (dto.email !== undefined) u.emailNotificationsEnabled = dto.email;
    return this.users.save(u);
  }
}

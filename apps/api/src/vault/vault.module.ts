import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VaultEntry } from './vault-entity.entity';
import { VaultItem } from './vault-item.entity';
import { VaultService } from './vault.service';
import { VaultController } from './vault.controller';

@Module({
  imports: [TypeOrmModule.forFeature([VaultEntry, VaultItem])],
  providers: [VaultService],
  controllers: [VaultController],
})
export class VaultModule {}

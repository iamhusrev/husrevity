import { IsNotEmpty, IsOptional, MaxLength } from 'class-validator';
import { VaultEntry } from '../vault-entity.entity';
import { VaultItem } from '../vault-item.entity';

export class EntityRequestDto {
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @MaxLength(64)
  category?: string;

  @IsOptional()
  @MaxLength(512)
  description?: string;

  @IsOptional()
  @MaxLength(32)
  icon?: string;

  @IsOptional()
  @MaxLength(16)
  color?: string;
}

export class EntityResponseDto {
  id!: string;
  name!: string;
  category!: string | null;
  description!: string | null;
  icon!: string | null;
  color!: string;
  itemCount!: number;
  createdAt!: Date;
  updatedAt!: Date;

  static from(e: VaultEntry, itemCount: number): EntityResponseDto {
    return {
      id: e.id,
      name: e.name,
      category: e.category,
      description: e.description,
      icon: e.icon,
      color: e.color,
      itemCount,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    };
  }
}

export class ItemRequestDto {
  @IsNotEmpty()
  @MaxLength(255)
  label!: string;

  @IsNotEmpty()
  value!: string;

  @IsOptional()
  @MaxLength(512)
  description?: string;
}

export class ItemUpdateRequestDto {
  @IsOptional()
  @MaxLength(255)
  label?: string;

  @IsOptional()
  value?: string;

  @IsOptional()
  @MaxLength(512)
  description?: string;
}

export class ItemResponseDto {
  id!: string;
  entityId!: string;
  label!: string;
  value!: string;
  description!: string | null;

  static from(i: VaultItem, decryptedValue: string): ItemResponseDto {
    return {
      id: i.id,
      entityId: i.entityId,
      label: i.label,
      value: decryptedValue,
      description: i.description,
    };
  }
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';
import { NoteLink } from '../note-link.entity';
import { isValidNumericId } from '../../common/numeric-id.pipe';

export enum NoteLinkTargetType {
  ITEM = 'item',
  PROJECT = 'project',
  GOAL = 'goal',
}

export function IsNumericId(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isNumericId',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, _args: ValidationArguments) {
          if (value === undefined || value === null) return false;
          return isValidNumericId(value);
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a numeric ID (1-19 digits, <= bigint max)`;
        },
      },
    });
  };
}

export class CreateNoteLinkDto {
  @ApiProperty({ enum: NoteLinkTargetType, example: 'item' })
  @IsEnum(NoteLinkTargetType, {
    message: 'targetType must be one of: item, project, goal',
  })
  targetType!: NoteLinkTargetType;

  @ApiProperty({ example: '123' })
  @IsNotEmpty({ message: 'targetId is required' })
  @IsNumericId({ message: 'targetId must be a numeric ID (1-19 digits, <= bigint max)' })
  targetId!: string;
}

export class NoteLinkQueryDto {
  @ApiProperty({ enum: NoteLinkTargetType, example: 'item' })
  @IsEnum(NoteLinkTargetType, {
    message: 'targetType must be one of: item, project, goal',
  })
  targetType!: NoteLinkTargetType;

  @ApiProperty({ example: '123' })
  @IsNotEmpty({ message: 'targetId is required' })
  @IsNumericId({ message: 'targetId must be a numeric ID (1-19 digits, <= bigint max)' })
  targetId!: string;
}

export class NoteLinkResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  noteId!: string;

  @ApiProperty({ enum: NoteLinkTargetType })
  targetType!: NoteLinkTargetType;

  @ApiProperty()
  targetId!: string;

  @ApiPropertyOptional()
  targetTitle!: string | null;

  @ApiProperty()
  createdAt!: Date;

  static from(link: NoteLink, targetTitle?: string | null): NoteLinkResponseDto {
    return {
      id: link.id,
      noteId: link.noteId,
      targetType: link.targetType as NoteLinkTargetType,
      targetId: link.targetId,
      targetTitle: targetTitle ?? null,
      createdAt: link.createdAt,
    };
  }
}

export class LinkedNoteDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  updatedAt!: Date;
}

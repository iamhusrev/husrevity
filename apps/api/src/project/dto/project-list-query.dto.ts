import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

export const PROJECT_LIST_FILTERS = ['all', 'mine', 'shared'] as const;
export type ProjectListFilter = (typeof PROJECT_LIST_FILTERS)[number];

export class ProjectListQueryDto {
  @ApiPropertyOptional({
    enum: PROJECT_LIST_FILTERS,
    description:
      "'all' (default) = owned + shared, 'mine' = owned only, 'shared' = owned by others",
  })
  @IsOptional()
  @IsIn(PROJECT_LIST_FILTERS)
  filter?: ProjectListFilter;
}

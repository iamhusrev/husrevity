import { IsNotEmpty, MaxLength } from 'class-validator';

export class DictateItemsRequestDto {
  @IsNotEmpty()
  @MaxLength(4000)
  text!: string;
}

export class DictateItemsResponseDto {
  items!: string[];
}

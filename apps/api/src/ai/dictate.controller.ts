import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { DictateService } from './dictate.service';
import {
  DictateItemsRequestDto,
  DictateItemsResponseDto,
} from './dto/dictate-dtos';

@ApiTags('ai')
@ApiBearerAuth()
@Controller('ai')
export class DictateController {
  constructor(private readonly svc: DictateService) {}

  /**
   * AI dictation-to-items split endpoint.
   * Parses free-form dictated text into separate action-oriented to-do items.
   */
  @Post('dictate-items')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  async dictateItems(
    @Body() body: DictateItemsRequestDto,
  ): Promise<DictateItemsResponseDto> {
    const items = await this.svc.splitIntoItems(body.text);
    return { items };
  }
}

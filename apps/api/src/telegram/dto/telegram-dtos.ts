import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TelegramLinkCodeResponseDto {
  @ApiProperty({ description: 'Short-lived hex link code for Telegram bot binding' })
  code!: string;

  @ApiPropertyOptional({ description: 'Telegram bot username if configured' })
  botUsername!: string | null;

  @ApiProperty({ description: 'Expiration ISO timestamp of the link code' })
  expiresAt!: string;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SlackLinkCodeResponseDto {
  @ApiProperty({ description: 'Short-lived hex link code for Slack bot binding' })
  code!: string;

  @ApiPropertyOptional({ description: 'Slack bot username if configured' })
  botUsername!: string | null;

  @ApiProperty({ description: 'Expiration ISO timestamp of the link code' })
  expiresAt!: string;
}

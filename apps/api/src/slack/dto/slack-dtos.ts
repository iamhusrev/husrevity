import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SlackLinkCodeResponseDto {
  @ApiProperty({ description: 'Short-lived hex link code for Slack bot binding' })
  code!: string;

  @ApiPropertyOptional({ description: 'Slack bot username if configured' })
  botUsername!: string | null;

  @ApiProperty({ description: 'Expiration ISO timestamp of the link code' })
  expiresAt!: string;
}

export class SlackLinkStatusResponseDto {
  @ApiProperty() configured!: boolean;
  @ApiProperty() linked!: boolean;
  @ApiPropertyOptional() botUsername!: string | null;
  @ApiPropertyOptional() linkedAt!: string | null;
  @ApiPropertyOptional({ description: 'Unexpired, unused link code if one is pending' })
  pendingCode!: string | null;
  @ApiPropertyOptional() pendingCodeExpiresAt!: string | null;
}

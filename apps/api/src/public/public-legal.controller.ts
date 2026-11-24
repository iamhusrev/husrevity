import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/public.decorator';
import { PublicLegalIdentity, PublicLegalService } from './public-legal.service';

@Controller('public')
export class PublicLegalController {
  constructor(private readonly legal: PublicLegalService) {}

  @Public()
  @Get('legal')
  getLegal(): PublicLegalIdentity {
    return this.legal.getIdentity();
  }
}

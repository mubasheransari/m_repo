import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CITIES } from './cities';

@UseGuards(JwtAuthGuard)
@Controller('geo')
export class GeoController {
  @Get('cities') cities() { return CITIES; }
}

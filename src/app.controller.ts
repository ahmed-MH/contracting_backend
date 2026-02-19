import { Controller, Get } from '@nestjs/common';
import { Public } from './common/decorators/public.decorator';

@Controller()
export class AppController {
  @Public()
  @Get('health')
  healthCheck() {
    return {
      status: 'ok',
      time: new Date().toISOString(),
      version: '1.0.0',
    };
  }
}

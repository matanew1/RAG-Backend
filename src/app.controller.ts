import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { join } from 'path';

@Controller()
export class AppController {
  @Get('*')
  serveFrontend(@Res() res: Response) {
    // Serve index.html for any unmatched routes (SPA fallback)
    const indexPath = join(__dirname, '..', 'index.html');
    res.sendFile(indexPath);
  }
}

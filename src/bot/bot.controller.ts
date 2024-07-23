import { Controller, Get, Header, Param, Res } from '@nestjs/common';
import { BotService } from './bot.service';
import type { Response } from 'express'; // Assuming that we are using the ExpressJS HTTP Adapter

@Controller('bot')
export class BotController {
  constructor(private readonly botService: BotService) {}

  @Get(':fileId')
  @Header('content-type', 'image/jpeg')
  async getMedia(
    @Param('fileId') fileId: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      console.log('query  : ', fileId);
      const response = await this.botService.getMedia(fileId);
      if (response.buffer) {
        res.send(response.buffer);
      }
    } catch (error) {
      console.log(error);
    }
  }
}

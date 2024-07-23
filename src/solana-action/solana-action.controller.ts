import {
  Controller,
  Get,
  Header,
  HostParam,
  Param,
  Req,
  Res,
} from '@nestjs/common';
import type { Response, request } from 'express';
import { SolanaActionService } from './solana-action.service';
import { ACTIONS_CORS_HEADERS } from '@solana/actions';

@Controller('solana-action')
export class SolanaActionController {
  constructor(private readonly solanaActionService: SolanaActionService) {}

  @Get(':id')
  // @Header('headers', `${ACTIONS_CORS_HEADERS}`)
  async getAction(
    @Param('id')
    id: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      console.log(req.headers['host']);
      const baseUrl = `${req['protocol']}://${req.headers['host']}`;
      console.log(baseUrl);
      const responsePayload = await this.solanaActionService.getAction(
        baseUrl,
        id,
      );
      if (responsePayload) {
        res.set(ACTIONS_CORS_HEADERS);
        return res.json(responsePayload);
      }
    } catch (error) {
      console.log(error);
    }
  }
}

import {
  Controller,
  Get,
  Header,
  Options,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Response, request } from 'express';
import { AppService } from './app.service';
import { SolanaActionService } from './solana-action/solana-action.service';
import { ACTIONS_CORS_HEADERS, ActionsJson } from '@solana/actions';
import { map } from 'rxjs';

const baseURL =
  process.env.NODE_ENV === 'production'
    ? 'https://eventblink.xyz'
    : 'http://localhost:3001';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly solanaActionService: SolanaActionService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  // @Options(':action')
  // @Header('headers', `${ACTIONS_CORS_HEADERS}`)
  // async OptionAction(
  //   @Query('event') event: string,
  //   @Req() req: Request,
  //   @Res({ passthrough: true }) res: Response,
  // ) {
  //   try {
  //     // console.log(req.headers['host']);
  //     // const baseUrl = `${req['protocol']}://${req.headers['host']}`;
  //     // console.log(baseUrl);
  //     const responsePayload = await this.solanaActionService.getAction(event);
  //     if (responsePayload) {
  //       res.set(ACTIONS_CORS_HEADERS);
  //       return res.json(responsePayload);
  //     }
  //   } catch (error) {
  //     console.log(error);
  //   }
  // }

  // @Get(':action')
  // @Header('headers', `${ACTIONS_CORS_HEADERS}`)
  // async getAction(
  //   @Query('event') event: string,
  //   @Req() req: Request,
  //   @Res({ passthrough: true }) res: Response,
  // ) {
  //   try {
  //     // console.log(req.headers['host']);
  //     // const baseUrl = `${req['protocol']}://${req.headers['host']}`;
  //     // console.log(baseUrl);
  //     const responsePayload = await this.solanaActionService.getAction(event);
  //     if (responsePayload) {
  //       res.set(ACTIONS_CORS_HEADERS);
  //       return res.json(responsePayload);
  //     }
  //   } catch (error) {
  //     console.log(error);
  //   }
  // }
}

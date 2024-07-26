import {
  Body,
  Controller,
  Get,
  Header,
  HostParam,
  Options,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Response, request } from 'express';
import { SolanaActionService } from './solana-action.service';
import { ACTIONS_CORS_HEADERS, ActionPostRequest } from '@solana/actions';
import { PublicKey } from '@solana/web3.js';

@Controller('solana-action')
export class SolanaActionController {
  constructor(private readonly solanaActionService: SolanaActionService) {}

  @Get()
  // @Header('headers', `${ACTIONS_CORS_HEADERS}`)
  async getAction(
    @Query('event') event: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      // console.log(req.headers['host']);
      // const baseUrl = `${req['protocol']}://${req.headers['host']}`;
      // console.log(baseUrl);
      const responsePayload = await this.solanaActionService.getAction(event);
      if (responsePayload) {
        res.set(ACTIONS_CORS_HEADERS);
        return res.json(responsePayload);
      }
    } catch (error) {
      console.log(error);
    }
  }

  @Post()
  // @Header('headers', `${ACTIONS_CORS_HEADERS}`)
  async postAction(
    @Query('event') event: string,
    @Query('email') email: string,
    @Query('name') name: string,
    @Body() bodyData: ActionPostRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      console.log({ ...bodyData, email, name, event });
      // Validate the client-provided input
      let account: PublicKey;
      try {
        account = new PublicKey(bodyData.account);
      } catch (err) {
        return res.status(400).json({
          success: false,
          message: 'Invalid "account" provided',
        });
      }

      const responsePayload = await this.solanaActionService.postAction({
        ...bodyData,
        email,
        name,
        event,
      });
      if (responsePayload) {
        res.set(ACTIONS_CORS_HEADERS);
        console.log(responsePayload);
        return res.json(responsePayload);
      }
    } catch (error) {
      console.log(error);
    }
  }
}

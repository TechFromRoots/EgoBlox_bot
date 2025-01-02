import { Controller, Post } from '@nestjs/common';
import { BotService } from './bot.service';

@Controller('bot')
export class BotController {
    constructor(
        private readonly telegramService: BotService,
    ) { }

    @Post()
    async sendBroadcast(): Promise<string> {

        await this.telegramService.broadcastMessage();
        return `Broadcast message sent to users.`;
    }
}

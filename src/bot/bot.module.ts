import { Module } from '@nestjs/common';
import { BotService } from './bot.service';
import { BotController } from './bot.controller';
import { DatabaseModule } from 'src/database/database.module';
import { TicketModule } from 'src/ticket/ticket.module';

@Module({
  imports: [DatabaseModule, TicketModule],
  providers: [BotService],
  controllers: [BotController],
})
export class BotModule {}

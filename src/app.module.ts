import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BotModule } from './bot/bot.module';
import { SolanaActionModule } from './solana-action/solana-action.module';

@Module({
  imports: [BotModule, SolanaActionModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

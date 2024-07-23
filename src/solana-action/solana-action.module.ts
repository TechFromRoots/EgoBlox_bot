import { Module } from '@nestjs/common';
import { SolanaActionController } from './solana-action.controller';
import { SolanaActionService } from './solana-action.service';

@Module({
  controllers: [SolanaActionController],
  providers: [SolanaActionService]
})
export class SolanaActionModule {}

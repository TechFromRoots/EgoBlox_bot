import { Module } from '@nestjs/common';
import { SolanaActionController } from './solana-action.controller';
import { SolanaActionService } from './solana-action.service';
import { DatabaseModule } from 'src/database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [SolanaActionController],
  providers: [SolanaActionService],
  exports: [SolanaActionService],
})
export class SolanaActionModule {}

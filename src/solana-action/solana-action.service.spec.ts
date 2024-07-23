import { Test, TestingModule } from '@nestjs/testing';
import { SolanaActionService } from './solana-action.service';

describe('SolanaActionService', () => {
  let service: SolanaActionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SolanaActionService],
    }).compile();

    service = module.get<SolanaActionService>(SolanaActionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

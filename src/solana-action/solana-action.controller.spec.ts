import { Test, TestingModule } from '@nestjs/testing';
import { SolanaActionController } from './solana-action.controller';

describe('SolanaActionController', () => {
  let controller: SolanaActionController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SolanaActionController],
    }).compile();

    controller = module.get<SolanaActionController>(SolanaActionController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});

import { Module } from '@nestjs/common';
import { BotService } from './bot.service';
import { BotController } from './bot.controller';
import { DatabaseModule } from 'src/database/database.module';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from 'src/database/schemas/user.schema';

@Module({
  imports: [
    DatabaseModule,
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
  ],
  providers: [BotService],
  controllers: [BotController],
})
export class BotModule {}

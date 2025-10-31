import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TranscriptionService } from './transcription.service';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [AppService, TranscriptionService],
})
export class AppModule {}

import { Injectable, BadRequestException } from '@nestjs/common';
import OpenAI from 'openai';

export interface UploadedFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

@Injectable()
export class TranscriptionService {
  private openai: OpenAI;

  constructor() {
    const apiKey = process.env.OPEN_AI || process.env.OPENAI_API_KEY;

    if (!apiKey) {
      throw new Error(
        'OpenAI API key is not set. Please set OPEN_AI or OPENAI_API_KEY environment variable.'
      );
    }

    this.openai = new OpenAI({
      apiKey: apiKey,
    });
  }

  async transcribeAudio(file: UploadedFile): Promise<string> {
    try {
      // Create a File object from the buffer
      // File constructor is available in Node.js 18+ with --experimental-global-web-streams
      // or globally in Node.js 20+
      let audioFile: File;

      try {
        audioFile = new File(
          [file.buffer],
          file.originalname || 'audio.mp3',
          {
            type: file.mimetype || 'audio/mpeg',
          }
        );
      } catch {
        // Fallback: create File-like object if File constructor fails
        const blob = new Blob([file.buffer], { type: file.mimetype || 'audio/mpeg' });
        audioFile = Object.assign(blob, {
          name: file.originalname || 'audio.mp3',
          lastModified: Date.now(),
        }) as File;
      }

      // Use OpenAI transcription API
      // The SDK accepts File, Blob, or File-like objects
      const transcription = await this.openai.audio.transcriptions.create({
        file: audioFile,
        model: 'whisper-1',
      });

      return transcription.text;
    } catch (error) {
      if (error instanceof Error) {
        throw new BadRequestException(
          `Transcription failed: ${error.message}`
        );
      }
      throw new BadRequestException('Transcription failed');
    }
  }
}


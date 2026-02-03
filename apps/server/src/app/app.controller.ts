import {
  Controller,
  Get,
  Post,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Res,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiConsumes,
  ApiBody,
  ApiResponse,
  ApiBadRequestResponse,
  ApiProduces,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { AppService } from './app.service';
import { TranscriptionService } from './transcription.service';
import { TranscriptionResponseDto } from './dto/transcription-response.dto';

@ApiTags('API')
@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly transcriptionService: TranscriptionService
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get API information' })
  @ApiResponse({ status: 200, description: 'Successful response' })
  getData() {
    return this.appService.getData();
  }

  @Post('transcribe')
  @UseInterceptors(FileInterceptor('audio'))
  @ApiTags('transcription')
  @ApiOperation({
    summary: 'Transcribe audio file to text',
    description:
      'Upload an audio file and get its transcription in text format. Supported formats: mp3, wav, webm, ogg, m4a, mp4',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        audio: {
          type: 'string',
          format: 'binary',
          description: 'Audio file for transcription',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Successful transcription',
    type: TranscriptionResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'File validation or processing error',
  })
  async transcribe(
    @UploadedFile() file: any
  ): Promise<TranscriptionResponseDto> {
    if (!file) {
      throw new BadRequestException('Audio file is required');
    }

    // Validate file type
    const allowedMimeTypes = [
      'audio/mpeg',
      'audio/mp3',
      'audio/wav',
      'audio/webm',
      'video/webm', // WebM files can have video/webm MIME type
      'audio/ogg',
      'audio/m4a',
      'audio/x-m4a',
      'audio/mp4',
      'video/mp4', // MP4 files can have video/mp4 MIME type
    ];

    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        `Unsupported file type: ${
          file.mimetype
        }. Supported types: ${allowedMimeTypes.join(', ')}`
      );
    }

    const text = await this.transcriptionService.transcribeAudio(file);
    return {
      success: true,
      transcription: text,
    };
  }

  @Post('transcribe/stream')
  @UseInterceptors(FileInterceptor('audio'))
  @ApiTags('transcription')
  @ApiOperation({
    summary: 'Transcribe audio file to text (streaming)',
    description:
      'Upload an audio file and receive transcription as Server-Sent Events (SSE) chunks. One request — response streamed back. Supported formats: mp3, wav, webm, ogg, m4a, mp4.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        audio: {
          type: 'string',
          format: 'binary',
          description: 'Audio file for transcription',
        },
      },
    },
  })
  @ApiProduces('text/event-stream')
  @ApiResponse({
    status: 200,
    description:
      'SSE stream: events with `chunk` (text fragment) and final event with `done: true` and full `transcription`. Content-Type: text/event-stream.',
    content: {
      'text/event-stream': {
        schema: {
          type: 'string',
          description:
            'Each line: data: {"chunk":"..."} or data: {"done":true,"transcription":"..."}',
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'File validation or processing error',
  })
  async transcribeStream(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Res({ passthrough: false }) res: Response
  ): Promise<void> {
    if (!file) {
      res.status(400).json({ message: 'Audio file is required' });
      return;
    }

    const allowedMimeTypes = [
      'audio/mpeg',
      'audio/mp3',
      'audio/wav',
      'audio/webm',
      'video/webm',
      'audio/ogg',
      'audio/m4a',
      'audio/x-m4a',
      'audio/mp4',
      'video/mp4',
    ];

    if (!allowedMimeTypes.includes(file.mimetype)) {
      res.status(400).json({
        message: `Unsupported file type: ${file.mimetype}. Supported types: ${allowedMimeTypes.join(', ')}`,
      });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const send = (data: object) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const filePayload = {
        buffer: file.buffer,
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
      };
      const text = await this.transcriptionService.transcribeAudioWithChunks(
        filePayload,
        (chunkText) => send({ chunk: chunkText })
      );
      send({ done: true, transcription: text });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Transcription failed';
      send({ error: message, done: true });
    } finally {
      res.end();
    }
  }
}

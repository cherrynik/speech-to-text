import {
  Controller,
  Get,
  Post,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiConsumes,
  ApiBody,
  ApiResponse,
  ApiBadRequestResponse,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
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
}

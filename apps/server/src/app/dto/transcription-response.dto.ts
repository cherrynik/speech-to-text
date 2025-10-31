import { ApiProperty } from '@nestjs/swagger';

export class TranscriptionResponseDto {
  @ApiProperty({
    description: 'Success status of the transcription operation',
    example: true,
  })
  success!: boolean;

  @ApiProperty({
    description: 'Transcribed text from audio',
    example: 'This is an example transcription of an audio file.',
  })
  transcription!: string;
}


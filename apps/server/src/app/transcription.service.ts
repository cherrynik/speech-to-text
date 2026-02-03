import { Injectable, BadRequestException } from '@nestjs/common';
import OpenAI from 'openai';
import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

export interface UploadedFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

/** OpenAI Whisper API limit (25 MB). */
const WHISPER_MAX_BYTES = 25 * 1024 * 1024;

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

  /**
   * Transcribe one file (must be under 25 MB for OpenAI).
   */
  async transcribeOne(file: UploadedFile): Promise<string> {
    let audioFile: File;
    try {
      audioFile = new File(
        [file.buffer],
        file.originalname || 'audio.mp3',
        { type: file.mimetype || 'audio/mpeg' }
      );
    } catch {
      const blob = new Blob([file.buffer], {
        type: file.mimetype || 'audio/mpeg',
      });
      audioFile = Object.assign(blob, {
        name: file.originalname || 'audio.mp3',
        lastModified: Date.now(),
      }) as File;
    }

    const transcription = await this.openai.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
    });
    return transcription.text;
  }

  /**
   * Split a large file into chunks under 25 MB using ffmpeg.
   * Requires ffmpeg on PATH. Returns paths to segment files (caller must cleanup).
   */
  /**
   * Segment duration in seconds. Keeps each chunk under ~25MB for typical formats (2 min WAV ~21MB).
   */
  private readonly SEGMENT_TIME_SEC = 120;

  private async splitAudioFile(
    inputPath: string,
    outputDir: string,
    ext: string
  ): Promise<string[]> {
    const segmentPattern = path.join(outputDir, `seg_%03d${ext}`);
    await new Promise<void>((resolve, reject) => {
      const args = [
        '-i',
        inputPath,
        '-f',
        'segment',
        '-segment_time',
        String(this.SEGMENT_TIME_SEC),
        '-c',
        'copy',
        '-reset_timestamps',
        '1',
        '-y',
        segmentPattern,
      ];
      const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stderr = '';
      proc.stderr?.on('data', (d) => (stderr += d.toString()));
      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`ffmpeg failed (${code}): ${stderr.slice(-500)}`));
          return;
        }
        resolve();
      });
    });
    const names = await fs.readdir(outputDir);
    const segments = names
      .filter((n) => n.startsWith('seg_') && n.endsWith(ext))
      .sort()
      .map((n) => path.join(outputDir, n));
    return segments;
  }

  private getExtension(mimetype: string, originalname: string): string {
    const byMime: Record<string, string> = {
      'audio/mpeg': '.mp3',
      'audio/mp3': '.mp3',
      'audio/wav': '.wav',
      'audio/webm': '.webm',
      'video/webm': '.webm',
      'audio/ogg': '.ogg',
      'audio/m4a': '.m4a',
      'audio/x-m4a': '.m4a',
      'audio/mp4': '.mp4',
      'video/mp4': '.mp4',
    };
    return (
      byMime[mimetype] ||
      (path.extname(originalname || '').toLowerCase() || '.mp3')
    );
  }

  /**
   * Transcribe audio of any size. Files over 25 MB are split with ffmpeg, then chunks are sent to Whisper and concatenated.
   */
  async transcribeAudio(file: UploadedFile): Promise<string> {
    if (file.size <= WHISPER_MAX_BYTES) {
      return this.transcribeOne(file);
    }

    const ext = this.getExtension(file.mimetype, file.originalname);
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'whisper-'));
    const inputPath = path.join(tmpDir, `input${ext}`);

    try {
      await fs.writeFile(inputPath, file.buffer);
      const segmentPaths = await this.splitAudioFile(inputPath, tmpDir, ext);
      if (segmentPaths.length === 0) {
        throw new Error('ffmpeg produced no segments');
      }

      const parts: string[] = [];
      for (const segPath of segmentPaths) {
        const buf = await fs.readFile(segPath);
        const text = await this.transcribeOne({
          buffer: buf,
          originalname: path.basename(segPath),
          mimetype: file.mimetype,
          size: buf.length,
        });
        if (text.trim()) parts.push(text.trim());
      }
      return parts.join(' ');
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  }

  /**
   * Same as transcribeAudio but calls onChunk(text) after each segment (for large files). For small files calls onChunk once with full text.
   */
  async transcribeAudioWithChunks(
    file: UploadedFile,
    onChunk: (text: string) => void
  ): Promise<string> {
    if (file.size <= WHISPER_MAX_BYTES) {
      const text = await this.transcribeOne(file);
      onChunk(text);
      return text;
    }

    const ext = this.getExtension(file.mimetype, file.originalname);
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'whisper-'));
    const inputPath = path.join(tmpDir, `input${ext}`);

    try {
      await fs.writeFile(inputPath, file.buffer);
      const segmentPaths = await this.splitAudioFile(inputPath, tmpDir, ext);
      if (segmentPaths.length === 0) {
        throw new Error('ffmpeg produced no segments');
      }

      const parts: string[] = [];
      for (const segPath of segmentPaths) {
        const buf = await fs.readFile(segPath);
        const text = await this.transcribeOne({
          buffer: buf,
          originalname: path.basename(segPath),
          mimetype: file.mimetype,
          size: buf.length,
        });
        if (text.trim()) {
          parts.push(text.trim());
          onChunk(text.trim());
        }
      }
      return parts.join(' ');
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  }
}


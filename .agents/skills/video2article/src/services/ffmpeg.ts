import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { KeyframeMetadata } from '../types';

export function formatSecondsToTimestamp(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export async function findFFmpegBinary(customPath?: string): Promise<string | null> {
  const candidates = [
    customPath,
    'ffmpeg',
    '/usr/local/bin/ffmpeg',
    '/opt/homebrew/bin/ffmpeg',
    '/usr/bin/ffmpeg',
  ].filter(Boolean) as string[];

  for (const bin of candidates) {
    if (bin.includes('/') && existsSync(bin)) {
      return bin;
    }
    try {
      const proc = Bun.spawn([bin, '-version'], { stdout: 'pipe', stderr: 'pipe' });
      const exitCode = await proc.exited;
      if (exitCode === 0) {
        return bin;
      }
    } catch {
      // 继续下一个
    }
  }

  return null;
}

export async function checkFFmpegInstalled(): Promise<boolean> {
  const bin = await findFFmpegBinary();
  return bin !== null;
}

export async function extractAudio(
  videoPath: string,
  outputWavPath: string,
  ffmpegBinPath?: string
): Promise<string> {
  const ffmpegBin = ffmpegBinPath || (await findFFmpegBinary()) || 'ffmpeg';

  const proc = Bun.spawn(
    [
      ffmpegBin,
      '-y',
      '-loglevel',
      'error',
      '-i',
      videoPath,
      '-vn',
      '-acodec',
      'pcm_s16le',
      '-ar',
      '16000',
      '-ac',
      '1',
      outputWavPath,
    ],
    {
      stdout: 'ignore',
      stderr: 'pipe',
    }
  );

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`FFmpeg 音频提取失败 (code ${exitCode}): ${stderr}`);
  }

  return outputWavPath;
}

export async function extractKeyframes(
  videoPath: string,
  outputDir: string,
  intervalSeconds: number = 10,
  ffmpegBinPath?: string
): Promise<KeyframeMetadata[]> {
  const ffmpegBin = ffmpegBinPath || (await findFFmpegBinary()) || 'ffmpeg';

  await mkdir(outputDir, { recursive: true });

  const outputPattern = join(outputDir, 'frame_%04d.jpg');
  const fpsExpr = `1/${intervalSeconds}`;

  const proc = Bun.spawn(
    [
      ffmpegBin,
      '-y',
      '-loglevel',
      'error',
      '-i',
      videoPath,
      '-vf',
      `fps=${fpsExpr}`,
      '-q:v',
      '2',
      outputPattern,
    ],
    {
      stdout: 'ignore',
      stderr: 'pipe',
    }
  );

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`FFmpeg 抽帧失败 (code ${exitCode}): ${stderr}`);
  }

  const keyframes: KeyframeMetadata[] = [];
  const glob = new Bun.Glob('frame_*.jpg');

  const files: string[] = [];
  for await (const file of glob.scan(outputDir)) {
    files.push(file);
  }

  files.sort();

  files.forEach((filename, index) => {
    const timestampSeconds = index * intervalSeconds;
    const filepath = join(outputDir, filename);
    keyframes.push({
      filename,
      filepath,
      timestampSeconds,
      timestampFormatted: formatSecondsToTimestamp(timestampSeconds),
    });
  });

  return keyframes;
}

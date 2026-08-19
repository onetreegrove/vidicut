import { existsSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import type { WhisperSegment } from '../types';

export async function findWhisperBinary(customPath?: string): Promise<string | null> {
  const candidates = [
    customPath,
    'whisper-cli',
    'whisper-cpp',
    'whisper',
    '/usr/local/bin/whisper-cli',
    '/usr/local/bin/whisper-cpp',
    '/usr/local/bin/whisper',
    '/opt/homebrew/bin/whisper-cli',
    '/opt/homebrew/bin/whisper-cpp',
    '/opt/homebrew/bin/whisper',
    `${process.env.HOME}/whisper.cpp/build/bin/whisper-cli`,
    `${process.env.HOME}/whisper.cpp/main`,
  ].filter(Boolean) as string[];

  for (const bin of candidates) {
    if (bin.includes('/') && existsSync(bin)) {
      return bin;
    }

    try {
      const proc = Bun.spawn([bin, '--help'], { stdout: 'pipe', stderr: 'pipe' });
      const code = await proc.exited;
      if (code === 0 || code === 1) {
        return bin;
      }
    } catch {
      // 继续探查下一个
    }
  }

  return null;
}

export async function transcribeAudio(
  wavPath: string,
  modelPath: string,
  outputPrefix: string,
  whisperBin: string = 'whisper-cli'
): Promise<WhisperSegment[]> {
  if (!modelPath) {
    throw new Error('未提供 whisper.cpp GGML 模型路径，请使用 --whisper-model 指定或配置 WHISPER_MODEL');
  }

  if (!existsSync(modelPath)) {
    throw new Error(`找不到 whisper.cpp 模型文件: ${modelPath}`);
  }

  // 避免之前残留的 json 文件影响
  const jsonPath = `${outputPrefix}.json`;
  if (existsSync(jsonPath)) {
    await unlink(jsonPath).catch(() => {});
  }

  const args = [
    whisperBin,
    '-m',
    modelPath,
    '-f',
    wavPath,
    '-l',
    'auto',
    '-oj', // 导出 JSON 格式，其中包含每段的 start/end 时间戳与文字
    '-of',
    outputPrefix,
  ];

  const proc = Bun.spawn(args, {
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`whisper.cpp 转写失败 (exit code ${exitCode}): ${stderr}`);
  }

  const jsonFile = Bun.file(jsonPath);
  if (!(await jsonFile.exists())) {
    throw new Error(`whisper.cpp 未能生成预期 JSON 文件: ${jsonPath}`);
  }

  const rawData = await jsonFile.json();
  const rawSegments = rawData.transcription || rawData.segments || [];

  const segments: WhisperSegment[] = rawSegments.map((item: any) => {
    // 兼容 whisper.cpp 输出格式
    const text = (item.text || '').trim();
    let from = '00:00:00';
    let to = '00:00:00';
    let startMs = 0;
    let endMs = 0;

    if (item.timestamps) {
      from = item.timestamps.from || '00:00:00';
      to = item.timestamps.to || '00:00:00';
    } else if (item.offsets) {
      startMs = item.offsets.from || 0;
      endMs = item.offsets.to || 0;
      from = formatMs(startMs);
      to = formatMs(endMs);
    } else if (typeof item.from === 'number') {
      startMs = item.from;
      endMs = item.to;
      from = formatMs(startMs);
      to = formatMs(endMs);
    }

    return {
      timestamps: { from, to },
      text,
      startMs,
      endMs,
    };
  });

  return segments.filter((s) => s.text.length > 0);
}

function formatMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

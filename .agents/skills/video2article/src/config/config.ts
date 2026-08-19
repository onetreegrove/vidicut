import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { V2AConfig } from '../types';

const CONFIG_PATH = join(homedir(), '.v2arc.json');

export async function loadConfig(): Promise<V2AConfig> {
  try {
    const file = Bun.file(CONFIG_PATH);
    if (await file.exists()) {
      return await file.json();
    }
  } catch (error) {
    // 忽略无法读取配置的错误，返回空配置
  }
  return {};
}

export async function saveConfig(newConfig: Partial<V2AConfig>): Promise<V2AConfig> {
  const current = await loadConfig();
  const updated = { ...current, ...newConfig };
  await Bun.write(CONFIG_PATH, JSON.stringify(updated, null, 2));
  return updated;
}

export async function getResolvedConfig(options: Record<string, any>): Promise<{
  whisperBin: string;
  whisperModel: string;
  llmProvider: 'gemini' | 'openai' | 'agy';
  geminiApiKey?: string;
  openaiApiKey?: string;
  openaiBaseUrl?: string;
  agyBin?: string;
}> {
  const config = await loadConfig();

  const whisperBin =
    options.whisperBin ||
    process.env.WHISPER_BIN ||
    config.whisperBin ||
    '/usr/local/bin/whisper-cli';

  // 默认探测 ~/.cache/whisper/ 下的常用模型
  const defaultCachedModel = [
    join(homedir(), '.cache', 'whisper', 'ggml-base.bin'),
    join(homedir(), '.cache', 'whisper', 'ggml-large-v3-turbo.bin'),
    join(homedir(), '.cache', 'whisper', 'ggml-small.bin'),
    join(homedir(), '.cache', 'whisper', 'ggml-tiny.bin'),
  ].find((p) => existsSync(p)) || '';

  const whisperModel =
    options.whisperModel ||
    process.env.WHISPER_MODEL ||
    config.whisperModel ||
    defaultCachedModel;

  const llmProvider =
    options.llm ||
    config.llmProvider ||
    (process.env.GEMINI_API_KEY ? 'gemini' : process.env.OPENAI_API_KEY ? 'openai' : 'agy');

  const geminiApiKey =
    options.apiKey ||
    process.env.GEMINI_API_KEY ||
    config.geminiApiKey;

  const openaiApiKey =
    options.apiKey ||
    process.env.OPENAI_API_KEY ||
    config.openaiApiKey;

  const openaiBaseUrl =
    process.env.OPENAI_BASE_URL ||
    config.openaiBaseUrl;

  const agyBin =
    config.agyBin ||
    '/Users/justonetree/.local/bin/agy';

  return {
    whisperBin,
    whisperModel,
    llmProvider: llmProvider as 'gemini' | 'openai' | 'agy',
    geminiApiKey,
    openaiApiKey,
    openaiBaseUrl,
    agyBin,
  };
}

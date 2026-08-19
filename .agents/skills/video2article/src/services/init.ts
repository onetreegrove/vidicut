import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createSpinner, logError, logInfo, logSuccess, logTitle, logWarning } from '../cli/ui';
import { loadConfig, saveConfig } from '../config/config';
import { findFFmpegBinary } from './ffmpeg';
import { findAgyBinary } from './llm';
import { findWhisperBinary } from './whisper';

export const WHISPER_MODELS = {
  tiny: 'ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin',
  base: 'ggerganov/whisper.cpp/resolve/main/ggml-base.bin',
  small: 'ggerganov/whisper.cpp/resolve/main/ggml-small.bin',
  'large-v3-turbo': 'ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin',
};

export async function downloadWhisperModel(
  modelName: keyof typeof WHISPER_MODELS = 'base',
  targetDir: string = join(homedir(), '.cache', 'whisper'),
  useMirror: boolean = true
): Promise<string> {
  const relativePath = WHISPER_MODELS[modelName];
  if (!relativePath) throw new Error(`未知的模型类型: ${modelName}`);

  await mkdir(targetDir, { recursive: true });
  const targetPath = join(targetDir, `ggml-${modelName}.bin`);

  if (existsSync(targetPath)) {
    logSuccess(`模型文件已存在，跳过下载: ${targetPath}`);
    return targetPath;
  }

  const domain = useMirror ? 'https://hf-mirror.com' : 'https://huggingface.co';
  const url = `${domain}/${relativePath}`;

  logInfo(`正在准备下载 Whisper [${modelName}] 模型...`);
  logInfo(`下载地址: ${url}`);
  logInfo(`保存位置: ${targetPath}`);
  logInfo(`提示: 正在使用 curl 极速下载。若需手动下载，可复制上方链接在浏览器/下载器下载并保存到上述位置。`);

  // 使用 curl 命令原生下载，支持断点续传和控制台实时进度展示
  const proc = Bun.spawn(
    [
      'curl',
      '-L',
      '-C',
      '-',
      '--connect-timeout',
      '10',
      '--progress-bar',
      url,
      '-o',
      targetPath,
    ],
    {
      stdout: 'inherit',
      stderr: 'inherit',
    }
  );

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    if (useMirror) {
      logWarning(`国内镜像源连接失败，正在尝试官方源下载...`);
      return downloadWhisperModel(modelName, targetDir, false);
    }
    throw new Error(`curl 模型下载中断/失败 (退出码 ${exitCode})`);
  }

  logSuccess(`Whisper 模型下载成功: ${targetPath}`);
  return targetPath;
}

export async function runEnvironmentInit(options: { downloadModel?: string }): Promise<void> {
  logTitle('开始系统环境自检与配置初始化 (v2a init)');

  const currentConfig = await loadConfig();

  // 1. 检查 FFmpeg
  logInfo('检查 1/3: 探查 FFmpeg...');
  const ffmpegBin = await findFFmpegBinary();
  if (ffmpegBin) {
    logSuccess(`FFmpeg 可用: ${ffmpegBin}`);
  } else {
    logWarning(`未找到 FFmpeg！请运行 brew install ffmpeg 进行安装。`);
  }

  // 2. 检查 Whisper.cpp
  logInfo('\n检查 2/3: 探查 whisper.cpp 执行程序与 GGML 模型...');
  const whisperBin = await findWhisperBinary(currentConfig.whisperBin);
  let whisperModel = currentConfig.whisperModel;

  if (whisperBin) {
    logSuccess(`whisper.cpp 可执行程序可用: ${whisperBin}`);
    await saveConfig({ whisperBin });
  } else {
    logWarning(`未在 PATH 中查找到 whisper.cpp 可执行程序 (whisper-cli)`);
    logInfo('提示: 可以使用 `brew install whisper-cpp` 安装，或自行编译 whisper.cpp 并将 binary 路径配置到 v2a。');
  }

  if (whisperModel && existsSync(whisperModel)) {
    logSuccess(`Whisper GGML 模型已被指定并有效: ${whisperModel}`);
  } else {
    logWarning(`未检测到已配置且有效的 Whisper GGML 模型文件。`);

    const modelToDownload = (options.downloadModel || 'base') as keyof typeof WHISPER_MODELS;
    try {
      const downloadedPath = await downloadWhisperModel(modelToDownload);
      whisperModel = downloadedPath;
      await saveConfig({ whisperModel: downloadedPath });
      logSuccess(`自动保存 Whisper 模型路径配置: ${downloadedPath}`);
    } catch (e: any) {
      logError(`模型自动下载失败 (${e.message})。`);
      logInfo(`💡 解决方式：您可以直接在浏览器打开镜像下载地址进行手动下载：`);
      logInfo(`https://hf-mirror.com/ggerganov/whisper.cpp/resolve/main/ggml-base.bin`);
      logInfo(`下载后运行以下命令指定路径：`);
      logInfo(`bun run src/index.ts config set WHISPER_MODEL /你的下载路径/ggml-base.bin`);
    }
  }

  // 3. 检查 LLM Provider
  logInfo('\n检查 3/3: 探查 LLM 提供商 (agy / API Key)...');
  const agyBin = await findAgyBinary(currentConfig.agyBin);
  if (agyBin) {
    logSuccess(`找到本地 agy CLI: ${agyBin} (已自动启用免 API Key 模式)`);
    await saveConfig({ llmProvider: 'agy', agyBin });
  } else {
    logInfo(`未找到 agy CLI，将检查是否配置了 GEMINI_API_KEY 或 OPENAI_API_KEY。`);
    if (process.env.GEMINI_API_KEY || currentConfig.geminiApiKey) {
      logSuccess(`配置了 Gemini API Key`);
    } else if (process.env.OPENAI_API_KEY || currentConfig.openaiApiKey) {
      logSuccess(`配置了 OpenAI API Key`);
    } else {
      logWarning(`未配置 LLM API Key，且未检查到 agy CLI。转换时需要提供 --api-key。`);
    }
  }

  logTitle('🎉 环境自检与初始化完成');
  const updatedConfig = await loadConfig();
  console.log('当前持久化配置文件 (~/.v2arc.json):');
  console.log(JSON.stringify(updatedConfig, null, 2));
}

import { existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { Command } from 'commander';
import { getResolvedConfig, loadConfig, saveConfig } from '../config/config';
import { checkFFmpegInstalled, extractAudio, extractKeyframes, findFFmpegBinary } from '../services/ffmpeg';
import { exportArticleAndAssets } from '../services/exporter';
import { runEnvironmentInit } from '../services/init';
import { generateArticleFromTranscript } from '../services/llm';
import { filterDeduplicateKeyframes } from '../services/vision';
import { findWhisperBinary, transcribeAudio } from '../services/whisper';
import type { KeyframeMetadata, WhisperSegment } from '../types';
import { createSpinner, logError, logInfo, logSuccess, logTitle, logWarning } from './ui';

export function setupCLI(): Command {
  const program = new Command();

  program
    .name('v2a')
    .description('Video to Article CLI - 将本地视频转化成精美图文 Markdown 文章')
    .version('1.0.0');

  // Init 命令
  program
    .command('init')
    .description('初始化 v2a 环境：自动检测系统依赖 (ffmpeg, whisper, agy) 并一键下载常用 Whisper 模型')
    .option('--download-model <name>', '选择自动下载的 Whisper 模型类型 (tiny, base, small, large-v3-turbo)', 'base')
    .action(async (options: any) => {
      try {
        await runEnvironmentInit({ downloadModel: options.downloadModel });
      } catch (error: any) {
        logError(`环境初始化失败: ${error.message}`);
        process.exit(1);
      }
    });

  // Convert 命令
  program
    .command('convert <videoPath>')
    .description('转换本地视频为 Markdown 文章')
    .option('-o, --output <dir>', '指定输出目录 (默认: ./dist/<video_name>)')
    .option('-s, --style <style>', '文章排版风格 (tech-blog, summary, tutorial)', 'tech-blog')
    .option('--whisper-bin <path>', 'whisper.cpp 可执行文件路径 (如 /usr/local/bin/whisper-cli)')
    .option('--whisper-model <path>', 'whisper.cpp GGML 模型路径 (如 ./models/ggml-base.bin)')
    .option('--extract-images <boolean>', '是否提取视频截图作为文章插图 (true/false)', 'true')
    .option('--frame-interval <seconds>', '抽帧时间间隔(秒)', '10')
    .option('--llm <provider>', 'LLM 服务提供商 (agy, gemini 或 openai)', 'agy')
    .option('--api-key <key>', 'LLM API Key (例如 Gemini 或 OpenAI 的 Key)')
    .action(async (videoPathInput: string, options: any) => {
      try {
        const videoPath = resolve(videoPathInput);

        if (!existsSync(videoPath)) {
          logError(`找不到视频文件: ${videoPath}`);
          process.exit(1);
        }

        const videoName = basename(videoPath, extname(videoPath));
        const outputDir = resolve(options.output || `./dist/${videoName}`);
        const resolvedConfig = await getResolvedConfig(options);

        logTitle(`开始处理视频: ${videoName}`);

        // 1. 验证基础工具
        const ffmpegBin = await findFFmpegBinary();
        if (!ffmpegBin) {
          logError('系统未安装 FFmpeg，请先安装 ffmpeg (例如 brew install ffmpeg)');
          process.exit(1);
        }

        const whisperBin = await findWhisperBinary(resolvedConfig.whisperBin);
        if (!whisperBin) {
          logError('未在系统 PATH 中找到 whisper.cpp 可执行文件 (whisper-cli/whisper/main)');
          logInfo('请使用 --whisper-bin /path/to/whisper-cli 指定路径，或运行 `v2a init` 进行自动检测');
          process.exit(1);
        }

        if (!resolvedConfig.whisperModel || !existsSync(resolvedConfig.whisperModel)) {
          logError('未找到有效的 whisper.cpp GGML 模型文件');
          logInfo('提示: 可以直接运行 `v2a init` 命令自动为您下载 Whisper 模型！');
          process.exit(1);
        }

        // 建立临时工作区
        const tmpDir = join(outputDir, '.tmp_v2a');
        await mkdir(tmpDir, { recursive: true });
        const tmpWavPath = join(tmpDir, 'audio_16k.wav');
        const tmpFramesDir = join(tmpDir, 'raw_frames');
        const tmpWhisperPrefix = join(tmpDir, 'transcribe');

        // 2. FFmpeg 提取音频与关键帧
        const spinnerMedia = createSpinner('正在使用 FFmpeg 提取音频与视频画面...').start();
        await extractAudio(videoPath, tmpWavPath, ffmpegBin);

        const shouldExtractImages = options.extractImages !== 'false';
        const frameInterval = parseInt(options.frameInterval, 10) || 10;
        let rawKeyframes: KeyframeMetadata[] = [];

        if (shouldExtractImages) {
          rawKeyframes = await extractKeyframes(videoPath, tmpFramesDir, frameInterval, ffmpegBin);
        }
        spinnerMedia.succeed(`媒体提取完成 (音频: WAV 16kHz, 原始截图: ${rawKeyframes.length} 张)`);

        // 3. 运行本地 whisper.cpp 离线 ASR
        const spinnerASR = createSpinner(`正在通过 whisper.cpp (${basename(whisperBin)}) 进行离线转写...`).start();
        let segments: WhisperSegment[] = [];
        try {
          segments = await transcribeAudio(
            tmpWavPath,
            resolvedConfig.whisperModel,
            tmpWhisperPrefix,
            whisperBin
          );
          spinnerASR.succeed(`Whisper ASR 转写成功 (共 ${segments.length} 个带时间戳字幕段落)`);
        } catch (err: any) {
          spinnerASR.fail(`Whisper.cpp 转写失败: ${err.message}`);
          process.exit(1);
        }

        // 4. 关键帧视觉去重
        let filteredKeyframes: KeyframeMetadata[] = [];
        if (shouldExtractImages && rawKeyframes.length > 0) {
          const spinnerVision = createSpinner('正在使用 sharp 进行关键帧视觉去重与筛选...').start();
          filteredKeyframes = await filterDeduplicateKeyframes(rawKeyframes);
          spinnerVision.succeed(`关键帧去重完成 (精选截图 ${filteredKeyframes.length} 张)`);
        }

        // 5. LLM 图文重构与合成
        const spinnerLLM = createSpinner(`正在调用 ${resolvedConfig.llmProvider.toUpperCase()} 进行文章结构重构与图文配图...`).start();
        let markdownContent = '';
        try {
          const apiKey = resolvedConfig.llmProvider === 'gemini'
            ? resolvedConfig.geminiApiKey
            : resolvedConfig.openaiApiKey;

          markdownContent = await generateArticleFromTranscript(segments, filteredKeyframes, {
            provider: resolvedConfig.llmProvider,
            apiKey,
            baseUrl: resolvedConfig.openaiBaseUrl,
            style: options.style,
            agyBin: resolvedConfig.agyBin,
          });
          spinnerLLM.succeed('LLM 文章重构与插图对齐成功');
        } catch (err: any) {
          spinnerLLM.fail(`LLM 生成文章失败: ${err.message}`);
          process.exit(1);
        }

        // 6. 导出最终文章与插图
        const spinnerExport = createSpinner('正在导出 Markdown 文章与关联图片资源...').start();
        const { articlePath, copiedImagesCount } = await exportArticleAndAssets(
          markdownContent,
          filteredKeyframes,
          outputDir
        );
        spinnerExport.succeed(`文章导出成功!`);

        // 清理临时文件
        await rm(tmpDir, { recursive: true, force: true }).catch(() => {});

        logTitle('🎉 转换完成');
        logSuccess(`Markdown 文章路径: ${articlePath}`);
        logInfo(`保留精选插图数量: ${copiedImagesCount} 张`);
      } catch (error: any) {
        logError(`转换过程发生错误: ${error.message}`);
        process.exit(1);
      }
    });

  // Config 命令
  const configCmd = program.command('config').description('管理 v2a 全局配置');

  configCmd
    .command('set <key> <value>')
    .description('设置全局配置 (如 WHISPER_BIN, WHISPER_MODEL, GEMINI_API_KEY, OPENAI_API_KEY)')
    .action(async (key: string, value: string) => {
      const keyMap: Record<string, string> = {
        WHISPER_BIN: 'whisperBin',
        WHISPER_MODEL: 'whisperModel',
        GEMINI_API_KEY: 'geminiApiKey',
        OPENAI_API_KEY: 'openaiApiKey',
        LLM_PROVIDER: 'llmProvider',
      };

      const targetKey = keyMap[key.toUpperCase()] || key;
      await saveConfig({ [targetKey]: value });
      logSuccess(`已更新配置: ${key} = ${value}`);
    });

  configCmd
    .command('get')
    .description('查看当前生效的所有配置')
    .action(async () => {
      const config = await loadConfig();
      console.log('\n当前配置文件 (~/.v2arc.json):');
      console.log(JSON.stringify(config, null, 2));
    });

  return program;
}

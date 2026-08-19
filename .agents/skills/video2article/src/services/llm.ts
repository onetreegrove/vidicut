import { existsSync } from 'node:fs';
import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import type { KeyframeMetadata, WhisperSegment } from '../types';

export interface LLMConfig {
  provider: 'gemini' | 'openai' | 'agy';
  apiKey?: string;
  baseUrl?: string;
  style?: string;
  language?: string;
  agyBin?: string;
}

export async function findAgyBinary(customPath?: string): Promise<string | null> {
  const candidates = [
    customPath,
    'agy',
    '/Users/justonetree/.local/bin/agy',
    `${process.env.HOME}/.local/bin/agy`,
    '/usr/local/bin/agy',
  ].filter(Boolean) as string[];

  for (const bin of candidates) {
    if (bin.includes('/') && existsSync(bin)) {
      return bin;
    }
    try {
      const proc = Bun.spawn([bin, '--help'], { stdout: 'pipe', stderr: 'pipe' });
      const code = await proc.exited;
      if (code === 0) return bin;
    } catch {}
  }
  return null;
}

export async function generateArticleFromTranscript(
  segments: WhisperSegment[],
  keyframes: KeyframeMetadata[],
  config: LLMConfig
): Promise<string> {
  const { provider, apiKey, baseUrl, style = 'tech-blog', language = 'zh', agyBin } = config;

  if (provider !== 'agy' && !apiKey) {
    throw new Error(`未检测到 API Key，请设置 ${provider === 'gemini' ? 'GEMINI_API_KEY' : 'OPENAI_API_KEY'}`);
  }

  // 格式化字幕内容带时间戳
  const transcriptFormatted = segments
    .map((s) => `[${s.timestamps.from} -> ${s.timestamps.to}] ${s.text}`)
    .join('\n');

  // 格式化关键帧元数据
  const keyframesFormatted = keyframes
    .map((k) => `- 文件名: ${k.filename}, 时间戳: ${k.timestampFormatted} (秒数: ${k.timestampSeconds})`)
    .join('\n');

  const systemPrompt = `你是一位顶尖的技术图书主编兼优质内容创作者。你的任务是将一份带有时间戳的视频语音转写文本与关键帧图片元数据，转化为一篇结构严谨、排版优雅、逻辑流畅的 Markdown 图文文章。

文章排版风格要求: ${style}
输出语言要求: ${language === 'zh' ? '中文' : language}`;

  const userPrompt = `【输入数据 1：视频语音转写记录 (含时间戳)】
${transcriptFormatted}

【输入数据 2：视频中抽取的可用关键帧截图列表】
${keyframesFormatted || '无可用截图'}

【写作与合成要求】
1. **结构化与大纲**：
   - 为文章拟定一个引人入胜的主标题 (H1)。
   - 开头附带 150 字以内的【核心摘要】或【导读】。
   - 将内容合理划分为 3 ~ 6 个核心小标题 (H2)。

2. **语言修饰与去口语化**：
   - 彻底擦除“嗯、啊、对吧、然后、这个”等口语助词与重复废话。
   - 纠正语音识别（ASR）可能出现的同音字错别字。
   - 将原本口头化的叙述改写为高可读性的书面文字，保持专业度与说服力。

3. **智能配图与时间戳对齐**：
   - 根据关键帧的时间戳（如 00:01:30）与视频对应章节讨论的主题，在相关段落中插入相对路径图片。
   - 语法必须为：\`![图释描述](./images/图片文件名.jpg)\`
   - 图片文件名必须从输入的【可用关键帧截图列表】中精准挑选，严禁伪造不存在的文件名。
   - 如果某小节没有契合的关键帧，宁缺毋滥，不要强行插入无关截图。

4. **格式规范**：
   - 使用标准的 GitHub Flavored Markdown 语法。
   - 专业术语、代码块、关键词适当加粗或使用 code span (例如 \`const\`)。

请直接输出最终的完整 Markdown 内容（无需在外面嵌套 JSON，只需直接返回 Markdown 文本）。`;

  if (provider === 'agy') {
    const resolvedAgyBin = (await findAgyBinary(agyBin)) || 'agy';
    const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

    const proc = Bun.spawn([resolvedAgyBin, '-p', fullPrompt], {
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      throw new Error(`agy CLI 调用失败 (exit code ${exitCode}): ${stderr}`);
    }

    const output = await new Response(proc.stdout).text();
    return output.trim();
  }

  if (provider === 'gemini') {
    const ai = new GoogleGenAI({ apiKey: apiKey! });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        { role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }
      ]
    });
    return response.text || '';
  } else {
    const openai = new OpenAI({
      apiKey,
      baseURL: baseUrl,
    });
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.5,
    });
    return response.choices[0]?.message?.content || '';
  }
}

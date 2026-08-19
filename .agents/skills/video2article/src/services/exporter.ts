import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { KeyframeMetadata } from '../types';

export async function exportArticleAndAssets(
  markdownContent: string,
  keyframes: KeyframeMetadata[],
  outputDir: string
): Promise<{ articlePath: string; copiedImagesCount: number }> {
  await mkdir(outputDir, { recursive: true });
  const imagesOutputDir = join(outputDir, 'images');
  await mkdir(imagesOutputDir, { recursive: true });

  let copiedImagesCount = 0;

  // 匹配 Markdown 中引用的图片文件名 ./images/frame_xxxx.jpg 或 images/frame_xxxx.jpg
  const imageRegex = /!\[.*?\]\(\.?\/?images\/([^)]+)\)/g;
  let match: RegExpExecArray | null;

  const referencedFilenames = new Set<string>();
  while ((match = imageRegex.exec(markdownContent)) !== null) {
    if (match[1]) {
      referencedFilenames.add(match[1]);
    }
  }

  // 只复制被文章实际引用的关键帧图片
  for (const kf of keyframes) {
    if (referencedFilenames.has(kf.filename)) {
      const destPath = join(imagesOutputDir, kf.filename);
      await copyFile(kf.filepath, destPath);
      copiedImagesCount++;
    }
  }

  const articlePath = join(outputDir, 'article.md');
  await Bun.write(articlePath, markdownContent);

  return { articlePath, copiedImagesCount };
}

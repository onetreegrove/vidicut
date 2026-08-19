---
name: video2article
description: 将本地视频内容自动转换为优雅排版、图文并茂的 Markdown 文章。支持 FFmpeg 提取音视频与关键帧、whisper.cpp 本地离线 ASR 语音识别、sharp 画面感知哈希去重，以及调用 agy CLI (Google One) 或 Gemini / OpenAI 进行文章结构化重构与插图自动对齐。
---

# Video to Article (本地视频转图文文章技能)

基于 **Bun + TypeScript** 开发的本地视频图文文章转化技能。通过 `Bun.spawn` 整合系统底层 `FFmpeg`、本地 `whisper.cpp` 离线 ASR 及 `agy` CLI 大模型驱动，实现将视频高效重构为结构严谨、去口语化、配图精准的 Markdown 文章。

## 触发条件

在以下场景激活并使用该技能：
- 用户要求“把视频转换成文章”、“视频转文字/博客”、“将课程/讲话视频整理为图文稿”。
- 用户提供了一个或多个本地视频文件路径（`.mp4`, `.mov`, `.mkv` 等）。
- 自动化视频笔记归档与长文本图文整理。

---

## 核心运行方式 (CLI 脚本调用)

统一使用 **Bun** 执行器运行技能脚本：

### 1. 环境一键自检与初始化

在首次使用前，或在检查环境依赖、下载 Whisper 模型时使用：

```bash
bun run .agents/skills/video2article/src/index.ts init [选项]
```

**选项：**
- `--download-model <name>`: 选择自动从国内镜像下载的 Whisper GGML 模型类型（可选: `tiny`, `base`, `small`, `large-v3-turbo`，默认: `base`）。

---

### 2. 转换本地视频为 Markdown 文章

```bash
bun run .agents/skills/video2article/src/index.ts convert <videoPath> [选项]
```

**参数与选项：**
- `<videoPath>`: (必需) 本地视频文件路径 (如 `./video.mp4`)。
- `-o, --output <dir>`: (可选) 文章与截图的输出存放目录 (默认: `./dist/<video_name>`)。
- `-s, --style <style>`: (可选) 文章排版风格 (`tech-blog`, `summary`, `tutorial`，默认: `tech-blog`)。
- `--extract-images <boolean>`: (可选) 是否提取视频关键帧作为文章插图 (`true`/`false`，默认: `true`)。
- `--frame-interval <seconds>`: (可选) 关键帧抽取时间间隔，单位秒 (默认: `10`)。
- `--llm <provider>`: (可选) 大模型重写提供商 (`agy`, `gemini`, `openai`，默认首选: `agy` 免 API Key 模式)。
- `--whisper-bin <path>`: (可选) 手动指定 `whisper.cpp` 可执行文件路径。
- `--whisper-model <path>`: (可选) 手动指定 `whisper.cpp` GGML 模型文件路径 (`.bin`)。

---

### 3. 全局配置管理

```bash
# 查看配置
bun run .agents/skills/video2article/src/index.ts config get

# 设置全局配置
bun run .agents/skills/video2article/src/index.ts config set WHISPER_BIN "/usr/local/bin/whisper-cli"
bun run .agents/skills/video2article/src/index.ts config set WHISPER_MODEL "~/.cache/whisper/ggml-base.bin"
```

---

## 输出产物规范

转换完成后，会在输出目录下生成以下结构：

```
output_dir/
├── article.md             # 精致排版、自动插图的 Markdown 正文
└── images/                # 文章中实际引用的精选关键帧截图
    ├── frame_0001.jpg
    └── frame_0003.jpg
```

- **Markdown 内容**：包含文章标题 (H1)、核心摘要/导读、结构化小标题 (H2)、加粗强调、代码块，并在合适段落插入精准的时间戳截图 `![描述](./images/frame_xxxx.jpg)`。
- **图片整理**：仅会自动保存并复制文章中实际被引用的精选截图，剔除无用的中间过程临时帧。

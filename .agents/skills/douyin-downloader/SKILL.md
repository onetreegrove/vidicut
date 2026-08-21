---
name: douyin-downloader
description: 解析并无水印下载抖音视频、图片集、合集 (mix) 的视频或图片资源。提取视频标题、作者、高清视频 MP4 / 组图 JPG 文件并保存到指定输出目录，输出可被后续流程 (如 qiaomu-cut) 读取的 JSON 清单。
---

# Douyin Downloader (抖音无水印解析与下载器)

使用 Bun + TypeScript 开发的抖音无水印资源提取与下载技能。支持解析单个分享口令/URL、直接视频 ID、图集笔记，以及剧集/主题合集 (mix)。

## 触发条件

在以下场景激活该技能：
- 用户给出一个或多个抖音分享链接/文本（例如：`7.42 p@m.pm ... https://v.douyin.com/xxxx/`）。
- 用户要求下载抖音视频、高清无水印图集或剧集/合集全部作品。
- 作为视频创作预处理环节，在进行视频剪辑（如 `qiaomu-cut`）前先下载抖音原素材。

## CLI 脚本调用规范

运行脚本需要使用 **Bun** 执行器：

### 1. 解析并下载单个视频/图集

```bash
bun run .agents/skills/douyin-downloader/scripts/dy_downloader.ts parse "<分享文本或URL>" [选项]
```

**参数与选项：**
- `<分享文本或URL>`: (必需) 包含 `v.douyin.com` 短链、`douyin.com/video/xxx` 链接或裸链接的文本。
- `--out <dir>`: (可选) 下载结果保存目录，默认为 `./downloads`。
- `--cookie <string>`: (可选) 自定义请求 Cookie 字符串（未提供时使用默认预设凭据）。
- `--json`: (可选) 强制将结果以标准 JSON 格式在 stdout 打印。

### 2. 批量解析并下载合集 (Mix)

```bash
bun run .agents/skills/douyin-downloader/scripts/dy_downloader.ts mix "<合集链接或mix_id>" [选项]
```

### 3. 批量解析并全量/定额下载博主主页作品 (Profile)

```bash
bun run .agents/skills/douyin-downloader/scripts/dy_downloader.ts profile "<博主主页链接或sec_user_id>" [选项]
```

**参数与选项：**
- `<博主主页链接或sec_user_id>`: (必需) 形如 `https://www.douyin.com/user/MS4wLjABAAAA...` 的主页 URL 或裸 `sec_user_id`。
- `--all` 或 `--count 0`: (可选) 开启全量下载模式，迭代自动爬取全部主页作品直到最后一页。
- `--count <number>`: (可选) 指定下载最新的 N 个作品，默认 `20`。
- `--delay <ms>`: (可选) 防风控串行休眠基础延迟时间（毫秒，默认 `1500`ms，并叠加随机抖动）。
- `--out <dir>`: (可选) 根保存路径，默认导出至 `./downloads/<sec_user_id>/`。
- `--json`: (可选) 输出结构化 JSON 数据。

**参数与选项：**
- `<合集链接或mix_id>`: (必需) 形如 `7535361333240268827` 的 mix_id 或包含该合集的链接。
- `--count <number>`: (可选) 抓取合集视频数量限制，默认 `20`。
- `--out <dir>`: (可选) 下载保存目录，默认为 `./downloads/<mix_id>`。
- `--cookie <string>`: (可选) 网页请求 Cookie。
- `--json`: (可选) 输出结构化 JSON。

---

## 输出规格 (Output Contract)

成功执行后，所有作品将统一按 **`./downloads/{sec_user_id}/{mix_<mix_id>|single}/aweme_<aweme_id>/`** 的极简二级分类方式自动归档落盘：

1. **带有合集的作品**（无论来自主页抓取还是链接抓取）：
   保存于 `./downloads/{sec_user_id}/mix_<mix_id>/aweme_<aweme_id>/`
2. **不属于任何合集的作品**（散条视频/主页散条作品）：
   统一保存于 `./downloads/{sec_user_id}/single/aweme_<aweme_id>/`

终端返回的标准 JSON 格式如下：

```json
{
  "status": "success",
  "type": "video", // "video" | "images" | "mix" | "profile"
  "aweme_id": "7660022413594661349",
  "mix_name": "心理学合集", // 可选
  "title": "作品标题",
  "author": {
    "nickname": "博主名字",
    "sec_uid": "..."
  },
  "files": [
    {
      "kind": "video", // "video" | "image" | "cover" | "audio"
      "path": "/absolute/path/to/downloads/<sec_user_id>/<category>/aweme_<aweme_id>/aweme_<aweme_id>.mp4",
      "url": "https://..."
    },
    {
      "kind": "cover",
      "path": "/absolute/path/to/downloads/<sec_user_id>/<category>/aweme_<aweme_id>/cover.jpg",
      "url": "https://..."
    },
    {
      "kind": "audio",
      "path": "/absolute/path/to/downloads/<sec_user_id>/<category>/aweme_<aweme_id>/music.mp3",
      "url": "https://..."
    }
  ]
}
```

作品文件夹内部包含：
- 无水印视频 MP4 或原图图片列表
- 封面图 `cover.jpg`
- 原声音频 `music.mp3`
- 该作品完整的结构化元数据 JSON 档案 `info.json`


---

## 注意事项与故障排查

1. **资源防盗链**：抖音 CDN 对媒体文件下载校验 `Referer: https://www.douyin.com/`，直接用默认 `fetch` 无法播放/下载时，脚本内置了 Header 伪装。
2. **重定向机制**：对于短链 `v.douyin.com`，脚本使用 HEAD/GET 追踪重定向 URL 提取 19 位纯数字 `aweme_id`。
3. **无水印换算**：对于普通 `playwm` 域名播放链，脚本会自动正则替换为 `play` 去水印接口。

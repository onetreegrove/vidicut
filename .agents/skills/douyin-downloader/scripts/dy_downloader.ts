import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { relative } from "node:path";
import { createHash } from "node:crypto";
import type { DyDownloadOutput, DownloadResultFile, DouyinAwemeItem } from "./types";

const MOBILE_USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1";

const DESKTOP_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/**
 * 随机休眠辅助函数，避免并发或连续陡峭请求被风控
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRandomDelay(baseMs: number = 1500, jitterMs: number = 1500): number {
  return baseMs + Math.floor(Math.random() * jitterMs);
}

function shortHash(input: string): string {
  return createHash("sha1").update(input).digest("hex").slice(0, 8);
}

function sanitizeAsciiFolderName(value: string, fallback: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9_-]/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned || fallback;
}

function getAuthorFolderName(item: DouyinAwemeItem): string {
  return sanitizeAsciiFolderName(item.author.sec_uid || item.author.uid || `author_${shortHash(item.author.nickname)}`, "author_unknown");
}

function getCategoryFolderName(item: DouyinAwemeItem, contextMixId?: string): string {
  const mixId = contextMixId || item.mix_id;
  if (mixId) {
    return `mix_${sanitizeAsciiFolderName(mixId, shortHash(mixId))}`;
  }
  if (item.mix_name) {
    return `mix_${shortHash(item.mix_name)}`;
  }
  return "single";
}

/**
 * 动态从 process.env 获取环境凭证
 */
function getDefaultCookie(): string {
  if (process.env.DY_COOKIE_FULL) {
    return process.env.DY_COOKIE_FULL;
  }
  const parts: string[] = ["theme_outer=first", "is_dash_user=1"];
  if (process.env.DY_COOKIE_TTWID) {
    parts.push(`ttwid=${process.env.DY_COOKIE_TTWID}`);
  }
  if (process.env.DY_COOKIE_SESSIONID) {
    parts.push(`sessionid=${process.env.DY_COOKIE_SESSIONID}`);
    parts.push(`sessionid_ss=${process.env.DY_COOKIE_SESSIONID}`);
  }
  return parts.join("; ");
}

let autoCapturedCookies: string[] = [];

/**
 * 获取伪装请求头
 */
function getHeaders(customCookie?: string, isMobile: boolean = false) {
  const defaultCookie = getDefaultCookie();
  const cookieHeader = [customCookie, ...autoCapturedCookies].filter(Boolean).join("; ");
  return {
    "User-Agent": isMobile ? MOBILE_USER_AGENT : DESKTOP_USER_AGENT,
    "Referer": "https://www.douyin.com/",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "zh-CN,zh;q=0.9",
    "Cookie": cookieHeader || defaultCookie,
  };
}

/**
 * 从文本中精确提取 URL
 */
function extractUrl(text: string): string | null {
  const match = text.match(/https?:\/\/(?:v|www|ies)\.douyin\.com\/[^\s\u4e00-\u9fa5]+/);
  if (match) {
    return match[0].replace(/[，。！,!\s]+$/, "");
  }
  const genericMatch = text.match(/https?:\/\/[^\s\u4e00-\u9fa5]+/);
  return genericMatch ? genericMatch[0].replace(/[，。！,!\s]+$/, "") : null;
}

/**
 * 从 URL 或文本中识别 ID (aweme_id, mix_id 或 sec_user_id)
 */
function parseUrlIds(url: string): { aweme_id?: string; mix_id?: string; sec_user_id?: string } {
  const secUserMatch = url.match(/user\/([A-Za-z0-9_-]{30,80})/);
  if (secUserMatch) {
    return { sec_user_id: secUserMatch[1] };
  }

  const secUserParamMatch = url.match(/sec_user_id=([A-Za-z0-9_-]{30,80})/);
  if (secUserParamMatch) {
    return { sec_user_id: secUserParamMatch[1] };
  }

  if (url.startsWith("MS4wLjABAAAA") && url.length >= 35) {
    return { sec_user_id: url.trim() };
  }

  const videoMatch = url.match(/(?:video|note|modal_id|share\/video)\/([0-9]{15,22})/);
  if (videoMatch) {
    return { aweme_id: videoMatch[1] };
  }

  const modalMatch = url.match(/modal_id=([0-9]{15,22})/);
  if (modalMatch) {
    return { aweme_id: modalMatch[1] };
  }

  const mixMatch = url.match(/mix\/detail\/([0-9]{15,22})/);
  if (mixMatch) {
    return { mix_id: mixMatch[1] };
  }

  if (/^[0-9]{15,22}$/.test(url.trim())) {
    return { aweme_id: url.trim() };
  }

  return {};
}

/**
 * 追踪短链并自动采集返回的 Location
 */
async function resolveRedirectUrl(url: string, customCookie?: string): Promise<string> {
  let currentUrl = url;
  for (let i = 0; i < 5; i++) {
    const ids = parseUrlIds(currentUrl);
    if (ids.aweme_id || ids.mix_id || ids.sec_user_id) {
      break;
    }
    if (!currentUrl.includes("v.douyin.com") && !currentUrl.includes("iesdouyin.com")) {
      break;
    }
    try {
      const res = await fetch(currentUrl, {
        method: "GET",
        headers: getHeaders(customCookie, true),
        redirect: "manual",
      });

      const location = res.headers.get("location");
      if (location) {
        currentUrl = location.startsWith("http") ? location : new URL(location, currentUrl).toString();
      } else {
        break;
      }
    } catch (e) {
      break;
    }
  }
  return currentUrl;
}

/**
 * 确保至少有通用的 ttwid Cookie
 */
async function ensureTtwidCookie(customCookie?: string): Promise<void> {
  const defaultCookie = getDefaultCookie();
  const hasTtwid =
    autoCapturedCookies.some((c) => c.startsWith("ttwid=")) ||
    customCookie?.includes("ttwid=") ||
    defaultCookie.includes("ttwid=");

  if (!hasTtwid) {
    try {
      const res = await fetch("https://www.douyin.com/", {
        headers: getHeaders(customCookie, false),
      });
      const setCookies = res.headers.getSetCookie();
      if (setCookies) {
        for (const sc of setCookies) {
          const cookiePair = sc.split(";")[0];
          if (cookiePair && !autoCapturedCookies.includes(cookiePair)) {
            autoCapturedCookies.push(cookiePair);
          }
        }
      }
    } catch (e) {
      // ignore
    }
  }
}

/**
 * 下载单个资源文件
 */
async function downloadFile(url: string, destPath: string, customCookie?: string): Promise<boolean> {
  try {
    const defaultCookie = getDefaultCookie();
    const res = await fetch(url, {
      headers: {
        "User-Agent": DESKTOP_USER_AGENT,
        "Referer": "https://www.douyin.com/",
        "Cookie": [customCookie, defaultCookie, ...autoCapturedCookies].filter(Boolean).join("; "),
      },
    });

    if (!res.ok) {
      return false;
    }

    const buffer = await res.arrayBuffer();
    await Bun.write(destPath, buffer);
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * 请求抖音 Web 端 Aweme Detail API
 */
async function fetchAwemeDetail(awemeId: string, customCookie?: string): Promise<any> {
  await ensureTtwidCookie(customCookie);

  const apiUrl = `https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=${awemeId}&device_platform=webapp&aid=6383`;
  const res = await fetch(apiUrl, {
    headers: getHeaders(customCookie, false),
  });

  if (!res.ok) {
    throw new Error(`请求抖音 API 失败, HTTP 状态码: ${res.status}`);
  }

  const json: any = await res.json();
  if (!json.aweme_detail) {
    throw new Error(`作品数据不存在或风控防护中 (aweme_id: ${awemeId})`);
  }
  return json.aweme_detail;
}

/**
 * 按 profile_api.md 选择最佳 MP4 码率画质
 */
function selectBestVideoUrl(videoObj: any): string | undefined {
  if (!videoObj) return undefined;

  if (Array.isArray(videoObj.bit_rate) && videoObj.bit_rate.length > 0) {
    const rates = videoObj.bit_rate
      .filter(
        (item: any) =>
          item.format === "mp4" &&
          item.is_h265 === 0 &&
          Array.isArray(item.play_addr?.url_list) &&
          item.play_addr.url_list.length > 0
      )
      .sort((a: any, b: any) => Number(b.bit_rate ?? 0) - Number(a.bit_rate ?? 0));

    if (rates[0] && rates[0].play_addr?.url_list?.[0]) {
      return rates[0].play_addr.url_list[0].replace("playwm", "play");
    }
  }

  const fallback = videoObj.play_addr_h264 || videoObj.play_addr;
  if (Array.isArray(fallback?.url_list) && fallback.url_list.length > 0) {
    return fallback.url_list[0].replace("playwm", "play");
  }

  return undefined;
}

/**
 * 转换提取数据格式 (包含合集名称提取)
 */
function extractAwemeItem(detail: any): DouyinAwemeItem {
  const aweme_id = detail.aweme_id;
  const desc = detail.desc || "无标题";
  const create_time = detail.create_time || 0;
  const author = {
    nickname: detail.author?.nickname || "未知作者",
    uid: detail.author?.uid || "",
    sec_uid: detail.author?.sec_uid || "",
    avatar: detail.author?.avatar_thumb?.url_list?.[0] || "",
  };

  const isImages = (Array.isArray(detail.images) && detail.images.length > 0) || detail.aweme_type === 68;
  const media_type = isImages ? "images" : "video";
  const duration_ms = detail.video?.duration || detail.duration || 0;

  let video_url: string | undefined = undefined;
  if (!isImages) {
    video_url = selectBestVideoUrl(detail.video);
  }

  const images: string[] = [];
  if (isImages && Array.isArray(detail.images)) {
    for (const img of detail.images) {
      if (img.url_list && img.url_list.length > 0) {
        images.push(img.url_list[img.url_list.length - 1]);
      }
    }
  }

  const cover_url = detail.video?.cover?.url_list?.[0] || detail.video?.origin_cover?.url_list?.[0] || "";
  const music_url = detail.music?.play_url?.url_list?.[0] || undefined;
  const music_title = detail.music?.title || undefined;

  // 提取合集/专辑名称 (如果有)
  const mix_name = detail.mix_info?.mix_name || detail.mix_name || undefined;
  const mix_id = detail.mix_info?.mix_id || detail.mix_id || undefined;

  const stats = {
    digg_count: detail.statistics?.digg_count || 0,
    comment_count: detail.statistics?.comment_count || 0,
    share_count: detail.statistics?.share_count || 0,
  };

  return {
    aweme_id,
    desc,
    create_time,
    author,
    media_type,
    duration_ms,
    video_url,
    images,
    cover_url,
    music_url,
    music_title,
    mix_name,
    mix_id,
    stats,
  };
}

/**
 * 执行作品文件下载 (新分类架构: {sec_user_id}/{mix_<mix_id>|single}/aweme_<aweme_id>)
 */
async function processAwemeItem(
  item: DouyinAwemeItem,
  outDir: string,
  customCookie?: string,
  contextMixId?: string
): Promise<DyDownloadOutput> {
  const authorFolder = getAuthorFolderName(item);
  const categoryFolder = getCategoryFolderName(item, contextMixId);
  const itemDir = resolve(join(outDir, authorFolder, categoryFolder, `aweme_${item.aweme_id}`));
  const infoPath = resolve(join(itemDir, "info.json"));

  // 断点跳过逻辑：如果已被下载，秒级返回
  if (await Bun.file(infoPath).exists()) {
    try {
      const existingJson = await Bun.file(infoPath).json();
      return existingJson as DyDownloadOutput;
    } catch (e) {
      // ignore
    }
  }

  await mkdir(itemDir, { recursive: true });

  const resultFiles: DownloadResultFile[] = [];
  let primaryMediaPath: string | undefined;
  let coverSavedPath: string | undefined;

  if (item.media_type === "video" && item.video_url) {
    const filename = `aweme_${item.aweme_id}.mp4`;
    const destPath = resolve(join(itemDir, filename));
    const ok = await downloadFile(item.video_url, destPath, customCookie);
    if (ok) {
      primaryMediaPath = destPath;
      resultFiles.push({
        kind: "video",
        path: destPath,
        url: item.video_url,
      });
    }
  } else if (item.media_type === "images" && item.images && item.images.length > 0) {
    for (let i = 0; i < item.images.length; i++) {
      const imgUrl = item.images[i];
      const filename = `image_${i + 1}.jpg`;
      const destPath = resolve(join(itemDir, filename));
      const ok = await downloadFile(imgUrl, destPath, customCookie);
      if (ok) {
        if (!primaryMediaPath) {
          primaryMediaPath = destPath;
        }
        resultFiles.push({
          kind: "image",
          path: destPath,
          url: imgUrl,
        });
      }
    }
  }

  if (item.cover_url) {
    const coverPath = resolve(join(itemDir, "cover.jpg"));
    const ok = await downloadFile(item.cover_url, coverPath, customCookie);
    if (ok) {
      coverSavedPath = coverPath;
      resultFiles.push({
        kind: "cover",
        path: coverPath,
        url: item.cover_url,
      });
    }
  }

  if (item.music_url) {
    const musicPath = resolve(join(itemDir, "music.mp3"));
    const ok = await downloadFile(item.music_url, musicPath, customCookie);
    if (ok) {
      resultFiles.push({
        kind: "audio",
        path: musicPath,
        url: item.music_url,
      });
    }
  }

  const output: DyDownloadOutput = {
    status: "success",
    type: item.media_type,
    aweme_id: item.aweme_id,
    mix_id: item.mix_id || contextMixId,
    mix_name: item.mix_name,
    title: item.desc,
    author: item.author,
    files: resultFiles,
    create_time: item.create_time,
    duration_ms: item.duration_ms,
    media_path: primaryMediaPath ? relative(process.cwd(), primaryMediaPath) : undefined,
    cover_path: coverSavedPath ? relative(process.cwd(), coverSavedPath) : undefined,
    cover: item.cover_url,
    music: item.music_url ? { title: item.music_title, url: item.music_url } : undefined,
  };

  await Bun.write(infoPath, JSON.stringify(output, null, 2));

  return output;
}

/**
 * 依据 awemeId 获取并下载作品
 */
async function processSingleAweme(
  awemeId: string,
  outDir: string,
  customCookie?: string
): Promise<DyDownloadOutput> {
  const detail = await fetchAwemeDetail(awemeId, customCookie);
  const item = extractAwemeItem(detail);
  return await processAwemeItem(item, outDir, customCookie);
}

/**
 * 批量获取合集作品列表
 */
async function fetchMixAwemes(
  mixId: string,
  count: number = 20,
  customCookie?: string
): Promise<{ items: DouyinAwemeItem[]; mixName?: string }> {
  await ensureTtwidCookie(customCookie);

  const apiUrl = `https://www.douyin.com/aweme/v1/web/mix/aweme/?mix_id=${mixId}&cursor=0&count=${count}&device_platform=webapp&aid=6383`;
  const res = await fetch(apiUrl, {
    headers: getHeaders(customCookie, false),
  });

  if (!res.ok) {
    throw new Error(`获取合集列表失败, HTTP 状态码: ${res.status}`);
  }

  const json: any = await res.json();
  if (!json.aweme_list || !Array.isArray(json.aweme_list)) {
    throw new Error(`合集数据列表为空或权限限制 (mix_id: ${mixId})`);
  }

  const mixName = json.mix_info?.mix_name || undefined;
  const items = json.aweme_list.map((detail: any) => extractAwemeItem(detail));

  return { items, mixName };
}

/**
 * 依据 sec_user_id 游标分页全量/限额抓取博主主页作品列表
 */
async function fetchProfileAwemes(
  secUserId: string,
  targetCount: number = 20,
  customCookie?: string,
  isJsonOutput: boolean = false
): Promise<{ items: DouyinAwemeItem[]; author?: any }> {
  await ensureTtwidCookie(customCookie);

  const fetchedItems: DouyinAwemeItem[] = [];
  const seenAwemeIds = new Set<string>();
  let cursor: string = "0";
  let hasMore: number = 1;
  let isFirstPage = true;
  let authorInfo: any = undefined;
  let pageIndex = 1;

  const limitDesc = targetCount === Infinity ? "全量作品" : `${targetCount} 个作品`;
  if (!isJsonOutput) {
    console.log(`🔍 开始全量/分页扫描博主主页 (${limitDesc})...`);
  }

  while (hasMore === 1 && fetchedItems.length < targetCount) {
    const pageSize = targetCount === Infinity ? 18 : Math.min(targetCount - fetchedItems.length, 18);
    const params = new URLSearchParams({
      device_platform: "webapp",
      aid: "6383",
      channel: "channel_pc_web",
      sec_user_id: secUserId,
      max_cursor: cursor,
      locate_query: "false",
      show_live_replay_strategy: "1",
      need_time_list: isFirstPage ? "1" : "0",
      time_list_query: "0",
      count: String(pageSize),
      publish_video_strategy_type: "2",
      from_user_page: "1",
    });

    const apiUrl = `https://www.douyin.com/aweme/v1/web/aweme/post/?${params.toString()}`;
    const res = await fetch(apiUrl, {
      headers: getHeaders(customCookie, false),
    });

    if (!res.ok) {
      throw new Error(`请求博主主页 API 失败, HTTP 状态码: ${res.status}`);
    }

    const json: any = await res.json();
    if (json.status_code !== 0 || !Array.isArray(json.aweme_list)) {
      throw new Error(`主页 API 拒绝响应或格式错误 (status_code: ${json.status_code})`);
    }

    const pageList: any[] = json.aweme_list;
    if (pageList.length === 0) {
      break;
    }

    let newAddedInPage = 0;
    for (const detail of pageList) {
      if (fetchedItems.length >= targetCount) break;
      const awemeId = detail.aweme_id;
      if (awemeId && !seenAwemeIds.has(awemeId)) {
        seenAwemeIds.add(awemeId);
        const item = extractAwemeItem(detail);
        if (!authorInfo && item.author) {
          authorInfo = item.author;
        }
        fetchedItems.push(item);
        newAddedInPage++;
      }
    }

    if (!isJsonOutput) {
      console.log(`  📄 第 ${pageIndex} 页抓取成功: 获取 ${pageList.length} 条，累计发现 ${fetchedItems.length} 条作品`);
    }

    hasMore = json.has_more ?? 0;
    const nextCursor = String(json.max_cursor ?? "");

    if (nextCursor === cursor || newAddedInPage === 0) {
      break;
    }
    cursor = nextCursor;
    isFirstPage = false;
    pageIndex++;

    if (hasMore === 1 && fetchedItems.length < targetCount) {
      await sleep(getRandomDelay(1000, 1000));
    }
  }

  return { items: fetchedItems, author: authorInfo };
}

/**
 * CLI 命令行入口处理
 */
async function main() {
  const args = Bun.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
  console.log(`
Douyin Downloader CLI (Bun + TS)

使用示例:
  # 1. 解析下载单视频/图集
  bun run dy_downloader.ts parse "https://v.douyin.com/xxxx/" --out ./downloads --json

  # 2. 解析下载合集
  bun run dy_downloader.ts mix "7535361333240268827" --count 10 --out ./downloads --json

  # 3. 抓取博主主页作品 (支持按分类自动归档: {sec_user_id}/{mix_<mix_id>|single}/aweme_<aweme_id>)
  bun run dy_downloader.ts profile "https://www.douyin.com/user/MS4wLjABAAAA47BZN..." --count 0 --delay 2000 --out ./downloads --json

  # 4. 仅查询博主元数据，不下载任何作品
  bun run dy_downloader.ts profile-meta "https://www.douyin.com/user/MS4wLjABAAAA47BZN..." --json
`);
    process.exit(0);
  }

  const command = args[0];
  const inputTarget = args[1];

  let outDir = "./downloads";
  let customCookie: string | undefined = undefined;
  let isJsonOutput = args.includes("--json");
  let isAllMode = args.includes("--all");
  let count = isAllMode ? Infinity : 20;
  let baseDelayMs = 1500;

  for (let i = 2; i < args.length; i++) {
    if (args[i] === "--out" && args[i + 1]) {
      outDir = args[i + 1];
      i++;
    } else if (args[i] === "--cookie" && args[i + 1]) {
      customCookie = args[i + 1];
      i++;
    } else if (args[i] === "--count" && args[i + 1]) {
      const parsedCount = parseInt(args[i + 1], 10);
      count = parsedCount === 0 ? Infinity : parsedCount;
      i++;
    } else if (args[i] === "--delay" && args[i + 1]) {
      baseDelayMs = parseInt(args[i + 1], 10) || 1500;
      i++;
    }
  }

  if (!inputTarget) {
    console.error(JSON.stringify({ status: "error", message: "未指定解析目标或链接" }));
    process.exit(1);
  }

  try {
    if (command === "profile-meta") {
      let secUserId = inputTarget;
      if (inputTarget.includes("http")) {
        const resolvedUrl = await resolveRedirectUrl(inputTarget, customCookie);
        const parsed = parseUrlIds(resolvedUrl);
        secUserId = parsed.sec_user_id || inputTarget;
      }

      const { author } = await fetchProfileAwemes(secUserId, 1, customCookie, true);
      const finalResult: DyDownloadOutput = {
        status: "success",
        type: "profile-meta",
        sec_user_id: secUserId,
        author,
        files: [],
      };

      if (isJsonOutput) {
        console.log(JSON.stringify(finalResult, null, 2));
      } else {
        console.log(`✅ 成功解析博主元数据 [${author?.nickname || secUserId}]`);
      }
    } else if (command === "parse") {
      const rawUrl = extractUrl(inputTarget) || inputTarget;
      const resolvedUrl = await resolveRedirectUrl(rawUrl, customCookie);
      const { aweme_id, mix_id, sec_user_id } = parseUrlIds(resolvedUrl);

      if (sec_user_id && !aweme_id && !mix_id) {
        const { items, author } = await fetchProfileAwemes(sec_user_id, count, customCookie, isJsonOutput);
        const outputs: DyDownloadOutput[] = [];
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const res = await processAwemeItem(item, outDir, customCookie);
          outputs.push(res);

          if (!isJsonOutput) {
            console.log(`  ⬇️ [${i + 1}/${items.length}] 已下载/归档: ${res.title.slice(0, 30)}`);
          }

          if (i < items.length - 1) {
            const delay = getRandomDelay(baseDelayMs, 1500);
            if (!isJsonOutput) {
              console.log(`  ⏱️ 防风控串行休眠 ${(delay / 1000).toFixed(1)}s...`);
            }
            await sleep(delay);
          }
        }

        const finalResult: DyDownloadOutput = {
          status: "success",
          type: "profile",
          sec_user_id,
          author,
          files: outputs.flatMap((o) => o.files),
          items: outputs,
        };

        if (isJsonOutput) {
          console.log(JSON.stringify(finalResult, null, 2));
        } else {
          console.log(`✅ 成功批量下载博主 [${author?.nickname || sec_user_id}] 共 ${outputs.length} 个作品 -> ${outDir}`);
        }
      } else if (mix_id && !aweme_id) {
        const { items, mixName } = await fetchMixAwemes(mix_id, count, customCookie);
        const outputs: DyDownloadOutput[] = [];

        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const res = await processAwemeItem(item, outDir, customCookie, mix_id);
          outputs.push(res);

          if (i < items.length - 1) {
            await sleep(getRandomDelay(baseDelayMs, 1000));
          }
        }

        const finalResult: DyDownloadOutput = {
          status: "success",
          type: "mix",
          mix_id,
          mix_name: mixName,
          files: outputs.flatMap((o) => o.files),
          items: outputs,
        };

        if (isJsonOutput) {
          console.log(JSON.stringify(finalResult, null, 2));
        } else {
          console.log(`✅ 成功批量下载合集 ${mixName || mix_id} 共 ${outputs.length} 个作品 -> ${outDir}`);
        }
      } else if (aweme_id) {
        const result = await processSingleAweme(aweme_id, outDir, customCookie);
        if (isJsonOutput) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(`✅ 成功下载 [${result.title}] (${result.type}) -> ${outDir}`);
        }
      } else {
        throw new Error(`无法从给定的链接或文本中解析出有效的作品 ID、合集 ID 或博主 sec_user_id: ${resolvedUrl}`);
      }
    } else if (command === "mix") {
      let mixId = inputTarget;
      if (inputTarget.includes("http")) {
        const resolvedUrl = await resolveRedirectUrl(inputTarget, customCookie);
        const parsed = parseUrlIds(resolvedUrl);
        mixId = parsed.mix_id || inputTarget;
      }

      const { items, mixName } = await fetchMixAwemes(mixId, count, customCookie);
      const outputs: DyDownloadOutput[] = [];

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const res = await processAwemeItem(item, outDir, customCookie, mixId);
        outputs.push(res);

        if (i < items.length - 1) {
          await sleep(getRandomDelay(baseDelayMs, 1000));
        }
      }

      const finalResult: DyDownloadOutput = {
        status: "success",
        type: "mix",
        mix_id: mixId,
        mix_name: mixName,
        files: outputs.flatMap((o) => o.files),
        items: outputs,
      };

      if (isJsonOutput) {
        console.log(JSON.stringify(finalResult, null, 2));
      } else {
        console.log(`✅ 成功批量下载合集 ${mixName || mixId} 共 ${outputs.length} 个作品 -> ${outDir}`);
      }
    } else if (command === "profile") {
      let secUserId = inputTarget;
      if (inputTarget.includes("http")) {
        const resolvedUrl = await resolveRedirectUrl(inputTarget, customCookie);
        const parsed = parseUrlIds(resolvedUrl);
        secUserId = parsed.sec_user_id || inputTarget;
      }

      const { items, author } = await fetchProfileAwemes(secUserId, count, customCookie, isJsonOutput);
      const outputs: DyDownloadOutput[] = [];

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const res = await processAwemeItem(item, outDir, customCookie);
        outputs.push(res);

        if (!isJsonOutput) {
          console.log(`  ⬇️ [${i + 1}/${items.length}] 已归档: ${res.title.slice(0, 30)}`);
        }

        if (i < items.length - 1) {
          const delay = getRandomDelay(baseDelayMs, 1500);
          if (!isJsonOutput) {
            console.log(`  ⏱️ 防风控串行休眠 ${(delay / 1000).toFixed(1)}s...`);
          }
          await sleep(delay);
        }
      }

      const finalResult: DyDownloadOutput = {
        status: "success",
        type: "profile",
        sec_user_id: secUserId,
        author,
        files: outputs.flatMap((o) => o.files),
        items: outputs,
      };

      if (isJsonOutput) {
        console.log(JSON.stringify(finalResult, null, 2));
      } else {
        console.log(`✅ 成功全量/批量下载博主 [${author?.nickname || secUserId}] 共 ${outputs.length} 个作品 -> ${outDir}`);
      }
    } else {
      throw new Error(`未知命令: ${command}，可用命令: parse, mix, profile`);
    }
  } catch (err: any) {
    const errorOutput = {
      status: "error",
      message: err?.message || String(err),
    };
    if (isJsonOutput) {
      console.log(JSON.stringify(errorOutput, null, 2));
    } else {
      console.error(`❌ 出错: ${errorOutput.message}`);
    }
    process.exit(1);
  }
}

main();

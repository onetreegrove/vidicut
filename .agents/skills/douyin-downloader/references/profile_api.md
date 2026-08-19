# 抖音博主主页作品接口

本文记录抖音 Web 端博主主页作品接口的实测行为，以及 `douyin-downloader` 后续实现主页下载时需要遵守的分页、媒体选择和下载流程。

实测日期为 2026-07-21。该接口是抖音网页使用的内部接口，不是有稳定性承诺的官方公开 API，参数和响应结构可能随时变化。

本文不保存真实 Cookie、token、请求签名或完整签名 CDN URL。示例中的敏感值均为占位符。

## 1. 适用范围与实测证据

本次实测主页：

```text
https://www.douyin.com/user/MS4wLjABAAAA47BZNwutOD68AsoU5TqZD1_ayUn0-0rcAuu0aPJz7Go
```

`/user/` 后的路径段是主页的 `sec_user_id`：

```text
MS4wLjABAAAA47BZNwutOD68AsoU5TqZD1_ayUn0-0rcAuu0aPJz7Go
```

页面显示 173 个作品。通过真实 Chrome 完整遍历主页后得到：

| 证据 | 实测值 |
| --- | ---: |
| API 页数 | 10 |
| 各页返回数量 | 20, 17, 17, 18, 18, 18, 18, 18, 18, 11 |
| 按 `aweme_id` 去重后的作品数 | 173 |
| 普通视频作品 | 171 |
| 图文作品 | 2 |
| 最后一页 `has_more` | 0 |

这些数字只描述本次抓取，不是接口限制或平台固定规则。置顶作品、删除作品、隐私状态和服务端排序都可能影响后续结果。

## 2. 主页作品接口

```text
GET https://www.douyin.com/aweme/v1/web/aweme/post/
```

Chrome 中成功发出的请求包含四类查询参数。

### 2.1 主页与分页参数

| 参数 | 首屏实测值 | 分页变化 | 直连建议 |
| --- | --- | --- | --- |
| `sec_user_id` | `/user/<sec_user_id>` 中的值 | 不变 | 必填；只从验证过的抖音主页 URL 提取。 |
| `max_cursor` | `0` | 使用上一页响应的 `max_cursor` | 必填；禁止本地递增或推算。 |
| `count` | `18` | 请求值不变，实际页大小不同 | 只作为服务端提示，不能当作精确页大小。 |
| `from_user_page` | `1` | 不变 | 模拟主页请求时保留。 |
| `locate_query` | `false` | 不变 | 除非新抓包证明需要变化，否则保留。 |
| `need_time_list` | `1` | 第二页起变为 `0` | 首屏上下文参数，不能所有页固定成同一值。 |
| `time_list_query` | `0` | 不变 | 除非新抓包证明需要变化，否则保留。 |
| `publish_video_strategy_type` | `2` | 不变 | Web 客户端策略参数，不赋予额外业务语义。 |
| `show_live_replay_strategy` | `1` | 不变 | 重放同类网页请求时保留。 |
| `whale_cut_token` | 空字符串 | 不变 | 本次请求中的可选/实验字段。 |
| `cut_version` | `1` | 不变 | 与同一版网页请求结构一起保留。 |

本次抓取的请求 cursor 链：

```text
0
1782478800000
1779973140000
1778159880000
1775990252000
1770290950000
1758598548000
1751460562000
1688701454000
1590919984000
```

每个后续请求都使用上一页响应返回的 `max_cursor`。本次 cursor 外观类似毫秒时间戳，但调用方必须把它视为不透明的服务端游标。

### 2.2 Web 客户端参数

| 参数 | 本次观察值 | 说明 |
| --- | --- | --- |
| `device_platform` | `webapp` | 与 Web 接口保持一致。 |
| `aid` | `6383` | 本次请求中的抖音 Web 应用标识。 |
| `channel` | `channel_pc_web` | 桌面网页渠道。 |
| `pc_client_type` | `1` | 桌面客户端标记。 |
| `update_version_code` | `170400` | 客户端生成，不应长期固化。 |
| `version_code` | `290100` | 客户端生成，网页版本变化后需要重新抓取。 |
| `version_name` | `29.1.0` | 应与 `version_code` 保持一致。 |
| `pc_libra_divert` | `Mac` | 本次 macOS 请求中的实验值。 |
| `support_h265` | `1` | 客户端声明支持 H.265。 |
| `support_dash` | `0` | 客户端声明不使用 DASH。 |
| `cookie_enabled` | `true` | 浏览器能力值。 |
| `cpu_core_num` | `4` | 浏览器/设备特征。 |
| `device_memory` | `16` | 浏览器/设备特征。 |
| `screen_width`, `screen_height` | `1680`, `1050` | 屏幕或视口特征。 |
| `browser_language` | `zh-CN` | 浏览器特征。 |
| `browser_platform` | `MacIntel` | 浏览器特征。 |
| `browser_name` | `Chrome` | 浏览器特征。 |
| `browser_version` | `150.0.0.0` | 浏览器特征，不应长期照抄。 |
| `browser_online` | `true` | 浏览器状态。 |
| `engine_name` | `Blink` | 浏览器特征。 |
| `engine_version` | `150.0.0.0` | 浏览器特征。 |
| `os_name` | `Mac OS` | 操作系统特征。 |
| `os_version` | `10.15.7` | 浏览器上报的系统值。 |
| `platform` | `PC` | 平台分类。 |
| `downlink`, `effective_type`, `round_trip_time` | `10`, `4g`, `50` | 浏览器估计的网络特征。 |

这些值只说明本次成功请求使用了什么。直接调用时应使用内部一致的一组客户端参数，不能混用互相矛盾的平台、浏览器版本和 User-Agent。目前没有证据证明每一个参数都单独必填。

### 2.3 会话参数

| 参数 | 本次分页变化 | 说明 |
| --- | --- | --- |
| `webid` | 10 页中不变 | 浏览器/会话标识；禁止固化或公开。 |
| `uifid` | 10 页中不变 | 浏览器/会话标识；禁止固化或公开。 |
| `verifyFp` | 10 页中不变 | 校验指纹，可能与会话绑定且会过期。 |
| `fp` | 与 `verifyFp` 属于同一组值 | 应与 `verifyFp` 保持一致，禁止固化。 |
| `msToken` | 10 页中出现 3 个不同值 | 动态会话 token，不能假设首屏值适用于所有分页。 |

这些值可能与 Cookie、浏览器指纹、请求顺序、IP 或时间绑定。现有下载器自动获取的 `ttwid` 是否足够调用该接口，尚未验证。

### 2.4 动态校验参数

| 参数 | 本次分页变化 | 说明 |
| --- | --- | --- |
| `timestamp` | 随请求时间变化，10 页出现 9 个值 | 应来自当前请求上下文。 |
| `a_bogus` | 10 页有 10 个不同值 | 逐请求校验值，禁止固化。 |
| `x-secsdk-web-signature` | 10 页有 10 个不同值 | 逐请求签名，禁止固化。 |

本次抓包不能证明这些参数的生成算法。因此，不能把“复制首屏签名 URL，只替换 `max_cursor`”写成可靠分页方法。

## 3. 请求头与 Cookie

最低请求形态：

```http
GET /aweme/v1/web/aweme/post/?... HTTP/1.1
Host: www.douyin.com
User-Agent: <与客户端参数匹配的 User-Agent>
Referer: https://www.douyin.com/
Accept: application/json, text/plain, */*
Accept-Language: zh-CN,zh;q=0.9
Cookie: <当前抖音网页会话 Cookie>
```

Cookie 和查询参数中的 token 属于凭据或与凭据相近的敏感会话数据：

- 只能通过用户明确提供的本地输入或已授权浏览器会话取得。
- 正常日志不得打印这些值。
- 错误信息、测试 fixture、JSON 清单和问题报告都必须脱敏。
- 不得把浏览器 Cookie 或完整签名请求 URL 提交到仓库。
- 浏览器、IP、时间或账号状态变化后，这些值可能立即失效。

下载媒体时也可能需要同一 User-Agent、抖音 Referer 和兼容的会话 Cookie。

## 4. 响应字段与分页状态机

成功响应包含以下关键顶层字段：

```json
{
  "status_code": 0,
  "min_cursor": 0,
  "max_cursor": 1782478800000,
  "has_more": 1,
  "aweme_list": [],
  "time_list": [],
  "log_pb": {},
  "request_item_cursor": 0,
  "post_serial": 0,
  "replace_series_cover": null
}
```

上面的字段值只是示例。完整分页状态机如下：

1. 校验输入域名，并从 `/user/<sec_user_id>` 提取用户标识。
2. 使用 `max_cursor=0` 和首屏请求上下文构造第一页请求。
3. 校验 HTTP 状态，并确认响应是 JSON。
4. 要求 `status_code === 0`；HTTP 200 本身不代表接口成功。
5. 要求 `aweme_list` 是数组。
6. 按响应顺序消费作品，并按 `aweme_id` 去重。
7. 将响应的 `max_cursor` 原样转成字符串供下一页使用。
8. `has_more === 0` 时结束。
9. `has_more === 1` 时，为返回的 cursor 创建新的有效请求上下文。
10. 收集到用户要求数量的合格视频后可提前结束。

以下情况必须停止并返回诊断错误：

- `has_more === 1` 时 cursor 重复。
- 声称还有下一页，但响应没有 `max_cursor`。
- 连续页面没有新增 `aweme_id`。
- 空页面反复返回 `has_more === 1`。
- 响应是 HTML、验证码页或其他非预期 JSON。
- 达到预设页数或时间上限。

禁止用 `min_cursor`、本地算术、页大小或作品时间戳推导下一页 cursor。

## 5. 作品类型判断

不能仅因作品含有 `video` 对象就判断为普通视频。图文作品也可能携带用于图文播放、音乐或合成展示的 video-like 对象。

本次观察到的类型：

| 作品类型 | 实测字段 |
| --- | --- |
| 普通视频 | `aweme_type=0`、`media_type=4`、没有非空 `images` 数组 |
| 图文作品 | `aweme_type=68`、`media_type=2`、`images` 非空 |

仅下载普通视频时可采用防御性判断：

```ts
function isOrdinaryVideo(aweme: any): boolean {
  const hasImages = Array.isArray(aweme.images) && aweme.images.length > 0;
  return !hasImages && aweme.aweme_type !== 68 && Boolean(aweme.video);
}
```

这些数字只是实测值，不是完整的官方枚举。遇到图文或未知类型时，应统计并报告跳过原因，不能静默缩小主页作品总数。

## 6. 视频地址与清晰度选择

本次 171 条普通视频全部包含：

- `video.play_addr.url_list`
- 一个或多个 `video.bit_rate[]` 候选

171 条视频都没有可用的 `video.download_addr`。因此，主页下载器不能依赖名为 `download_addr` 的固定字段。

建议选择顺序：

1. 读取 `video.bit_rate[]`。
2. 筛选 `format === "mp4"`、`is_h265 === 0` 且 `play_addr.url_list` 非空的候选。
3. 按数值 `bit_rate` 降序排列。
4. 选择最高码率的 H.264 MP4。
5. 没有兼容码率项时，回退到 `video.play_addr_h264.url_list`。
6. 再回退到 `video.play_addr.url_list`。
7. 保留所选地址对象的完整 `url_list`，作为有序 CDN 后备列表。

示例：

```ts
interface MediaCandidate {
  urls: string[];
  width?: number;
  height?: number;
  bitRate?: number;
  gearName?: string;
  codec: "h264" | "unknown";
}

function selectVideoCandidate(aweme: any): MediaCandidate | null {
  const rates = (aweme.video?.bit_rate ?? [])
    .filter((item: any) =>
      item.format === "mp4" &&
      item.is_h265 === 0 &&
      Array.isArray(item.play_addr?.url_list) &&
      item.play_addr.url_list.length > 0
    )
    .sort((left: any, right: any) =>
      Number(right.bit_rate ?? 0) - Number(left.bit_rate ?? 0)
    );

  if (rates[0]) {
    return {
      urls: rates[0].play_addr.url_list,
      width: rates[0].play_addr.width,
      height: rates[0].play_addr.height,
      bitRate: rates[0].bit_rate,
      gearName: rates[0].gear_name,
      codec: "h264",
    };
  }

  const fallback = aweme.video?.play_addr_h264 ?? aweme.video?.play_addr;
  if (!Array.isArray(fallback?.url_list) || fallback.url_list.length === 0) {
    return null;
  }

  return {
    urls: fallback.url_list,
    width: fallback.width,
    height: fallback.height,
    codec: "unknown",
  };
}
```

本次对一个样本地址发送 `Range: bytes=0-1023` 请求，得到 HTTP 206、`Content-Type: video/mp4` 和有效的 `Content-Range`。这只证明该样本在抓取当时有效；实际下载时仍必须逐个校验响应。

## 7. CDN 下载流程

对每个选中的视频：

1. 使用 `aweme_id` 生成稳定文件名。
2. 请求第一个候选 URL，允许重定向，携带抖音 Referer、匹配的 User-Agent，以及必要时的授权会话 Cookie。
3. 只接受 HTTP 200 或 206。
4. 校验响应是媒体内容，优先要求 `video/mp4`。即使 HTTP 为 200，也要拒绝 HTML、JSON 错误或验证码页面。
5. 流式写入 `<aweme_id>.mp4.part`，禁止把整个视频读入内存。
6. 要求结果非零字节；存在 `Content-Length` 或 `Content-Range` 时进行一致性校验。
7. 成功后原子重命名为 `<aweme_id>.mp4`。
8. 短暂网络错误或 5xx 使用有次数上限的退避重试。
9. 当前 URL 失败时，按顺序尝试同一 `url_list` 中的后备 CDN。
10. 全部地址返回 401、403、404、过期媒体或无效内容时，重新获取作品数据刷新地址。

CDN URL 可能包含短期路径、签名或查询参数，应把它们视为当前进程使用的临时下载能力：

- 不得描述成永久下载地址。
- 不得写入公开日志或长期清单。
- 长期数据只保存 `aweme_id`、作品来源页、抓取时间、画质信息和本地路径。

下载成功不等于获得转载或商业使用授权。下游清单应保留作者、来源页和待核验的许可状态。

## 8. 直连请求示例

下面的示例只说明如何组装请求，不生成有效动态校验值。

### 8.1 curl 请求第一页

```bash
curl --fail-with-body --compressed \
  'https://www.douyin.com/aweme/v1/web/aweme/post/?device_platform=webapp&aid=6383&channel=channel_pc_web&sec_user_id=<SEC_USER_ID>&max_cursor=0&locate_query=false&show_live_replay_strategy=1&need_time_list=1&time_list_query=0&count=18&publish_video_strategy_type=2&from_user_page=1&webid=<WEBID>&uifid=<UIFID>&msToken=<MS_TOKEN>&a_bogus=<A_BOGUS>&verifyFp=<VERIFY_FP>&fp=<FP>&timestamp=<UNIX_SECONDS>&x-secsdk-web-signature=<WEB_SIGNATURE>' \
  -H 'User-Agent: <MATCHING_DESKTOP_USER_AGENT>' \
  -H 'Referer: https://www.douyin.com/' \
  -H 'Accept: application/json, text/plain, */*' \
  -H 'Accept-Language: zh-CN,zh;q=0.9' \
  -H 'Cookie: <CURRENT_DOUYIN_WEB_SESSION_COOKIE>'
```

根据实际情况，可能还需要第 2.2 节中的完整 Web 客户端参数。所有占位符都必须来自当前已授权会话，不能直接照抄占位符或历史抓包值。

### 8.2 curl 请求下一页

```bash
curl --fail-with-body --compressed \
  'https://www.douyin.com/aweme/v1/web/aweme/post/?device_platform=webapp&aid=6383&channel=channel_pc_web&sec_user_id=<SEC_USER_ID>&max_cursor=<PREVIOUS_RESPONSE_MAX_CURSOR>&locate_query=false&show_live_replay_strategy=1&need_time_list=0&time_list_query=0&count=18&publish_video_strategy_type=2&from_user_page=1&webid=<WEBID>&uifid=<UIFID>&msToken=<CURRENT_MS_TOKEN>&a_bogus=<NEW_A_BOGUS>&verifyFp=<VERIFY_FP>&fp=<FP>&timestamp=<CURRENT_UNIX_SECONDS>&x-secsdk-web-signature=<NEW_WEB_SIGNATURE>' \
  -H 'User-Agent: <MATCHING_DESKTOP_USER_AGENT>' \
  -H 'Referer: https://www.douyin.com/' \
  -H 'Accept: application/json, text/plain, */*' \
  -H 'Cookie: <CURRENT_DOUYIN_WEB_SESSION_COOKIE>'
```

本次实测中，每一页都有新的 `a_bogus` 和 Web 签名，遍历过程中 `msToken` 也发生变化。复用第一页的动态参数不是经过验证的方案。

### 8.3 Bun 请求骨架

```ts
interface ProfileRequestContext {
  cookie: string;
  userAgent: string;
  webid: string;
  uifid: string;
  msToken: string;
  verifyFp: string;
  aBogus: string;
  webSignature: string;
  timestamp: number;
}

interface ProfilePage {
  aweme_list: any[];
  has_more: number;
  max_cursor: number | string;
  status_code: number;
}

async function fetchProfilePage(
  secUserId: string,
  cursor: string,
  firstPage: boolean,
  context: ProfileRequestContext
): Promise<ProfilePage> {
  const params = new URLSearchParams({
    device_platform: "webapp",
    aid: "6383",
    channel: "channel_pc_web",
    sec_user_id: secUserId,
    max_cursor: cursor,
    locate_query: "false",
    show_live_replay_strategy: "1",
    need_time_list: firstPage ? "1" : "0",
    time_list_query: "0",
    count: "18",
    publish_video_strategy_type: "2",
    from_user_page: "1",
    webid: context.webid,
    uifid: context.uifid,
    msToken: context.msToken,
    verifyFp: context.verifyFp,
    fp: context.verifyFp,
    timestamp: String(context.timestamp),
    a_bogus: context.aBogus,
    "x-secsdk-web-signature": context.webSignature,
  });

  const response = await fetch(
    `https://www.douyin.com/aweme/v1/web/aweme/post/?${params}`,
    {
      headers: {
        "User-Agent": context.userAgent,
        Referer: "https://www.douyin.com/",
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "zh-CN,zh;q=0.9",
        Cookie: context.cookie,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`主页请求失败，HTTP ${response.status}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error("主页接口返回了非 JSON 内容");
  }

  const page = await response.json() as ProfilePage;
  if (page.status_code !== 0 || !Array.isArray(page.aweme_list)) {
    throw new Error(`主页接口拒绝请求：${page.status_code}`);
  }

  if (page.has_more === 1 && page.max_cursor === undefined) {
    throw new Error("has_more=1，但响应缺少 max_cursor");
  }

  return page;
}
```

`ProfileRequestContext` 被有意设计为外部输入。本文不提供 `a_bogus`、`msToken`、`verifyFp` 或 Web 签名的生成算法。

## 9. 证据等级与已知限制

### 9.1 已验证

- 真实 Chrome 页面成功请求了 `/aweme/v1/web/aweme/post/`。
- 响应使用 `has_more` 和服务端返回的 `max_cursor` 分页。
- 10 页数据按 `aweme_id` 去重后，得到页面显示的 173 个作品。
- 响应中可区分 171 条普通视频和 2 条图文。
- 171 条普通视频都有 `play_addr` 和码率候选，但没有可用 `download_addr`。
- 一个 H.264 MP4 样本 CDN URL 支持 Range 请求并返回媒体数据。
- 每一页的 `a_bogus` 和 `x-secsdk-web-signature` 都变化，遍历中 `msToken` 也变化。

### 9.2 尚未验证

- 当前下载器仅使用 `ttwid + Referer + User-Agent`，能否在缺少其他浏览器状态时稳定调用主页接口。
- 只提供 Cookie 的直连方式是否适用于匿名、登录、私密或被限流的主页。
- 复制首屏签名请求后，只替换 `max_cursor` 能否完成分页。
- 每个会话参数、请求签名和 CDN URL 的有效期。
- 同一套参数是否适用于不同浏览器版本、账号、地区或 IP。

### 9.3 禁止依赖的高风险假设

- 固化本次观察到的 `webid`、`uifid`、`verifyFp`、`msToken`、`a_bogus` 或 Web 签名。
- 把该内部接口当成稳定的官方公开 API。
- 只看 HTTP 200，不检查内容类型和 `status_code`。
- 把 `count` 当成精确页大小。
- 把任意码率列表中的第一个地址当成最佳兼容文件。
- 把保存下来的 CDN URL 当成永久地址。

可能的失败表现包括 HTTP 403/429/5xx、HTTP 200 但 `status_code != 0`、权限或风控导致的空列表、HTML 验证码页面，以及从采集到下载之间已经过期的媒体 URL。

## 10. 后续实现决策

未来实现 `profile` 命令时，需要选择并验证以下一种方案：

### 10.1 Cookie 辅助直连

- 用户提供已授权 Cookie。
- CLI 直接调用主页接口。
- 缺少动态校验值或接口拒绝时明确失败。
- 实现最简单，但尚未证明 Cookie 足够。

### 10.2 DevTools 请求模板

- 用户从 DevTools 导出一条成功首屏请求。
- CLI 解析参数和请求头，并确保日志全部脱敏。
- CLI 尝试替换 cursor 完成分页。
- 由于实测每页签名都变化，该方式只能作为实验，不能预设为可靠方案。

### 10.3 Chrome/CDP 生成请求

- 已授权 Chrome 页面负责生成当前会话参数和签名。
- 下载器消费浏览器已经成功收到的 JSON 响应。
- 该方式与本次完整遍历一致，但属于浏览器辅助方案，不是纯接口直连。

在实现纯直连主页下载前，应先用一个公开主页做有数量上限的第一页测试，再用返回的 cursor 测试第二页，并记录两页之间必须更新的参数。任何依赖提交到仓库或长期保存凭据的方案都应拒绝。

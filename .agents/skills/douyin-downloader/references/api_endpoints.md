# Douyin Web API Endpoints Reference

本项目收集了抖音 Web 端常用解析 API 及参数规范。

博主主页作品接口、游标分页、动态会话参数与媒体选择的完整实测说明见 [`profile_api.md`](./profile_api.md)。该接口属于抖音网页内部接口，不是稳定的官方公开 API；不要固化 Cookie、token 或请求签名。

## 1. 单个视频 / 图集详情 API

- **Endpoint**: `GET https://www.douyin.com/aweme/v1/web/aweme/detail/`
- **Query Parameters**:
  - `aweme_id`: 19 位数字音视频 ID (如 `7353522794111436863`)
  - `device_platform`: `webapp`
  - `aid`: `6383`

- **关键字段映射**:
  - `aweme_detail.video.play_addr.url_list[0]`: 视频原文件播放地址（包含水印，可通过将域名路径 `/playwm/` 替换为 `/play/` 获取高清无水印重定向播放地址）。
  - `aweme_detail.images`: 若存在且非空，表示该内容为图集笔记。遍历 `images[i].url_list` 取最后一个 URL 获取最高分辨率图片。
  - `aweme_detail.desc`: 文本标题描述。
  - `aweme_detail.author`: 包含 `nickname`, `sec_uid`, `avatar_thumb` 等信息。

## 2. 合集 (Mix) 视频列表 API

- **Endpoint**: `GET https://www.douyin.com/aweme/v1/web/mix/aweme/`
- **Query Parameters**:
  - `mix_id`: 19 位合集 ID (如 `7535361333240268827`)
  - `cursor`: 分页游标 (默认从 `0` 开始)
  - `count`: 返回数量 (如 `10` 或 `20`)
  - `device_platform`: `webapp`
  - `aid`: `6383`

- **关键字段**:
  - `aweme_list`: 包含该合集中按顺序排布的 `aweme_detail` 列表。

## 3. 博主主页作品列表 API

- **Endpoint**: `GET https://www.douyin.com/aweme/v1/web/aweme/post/`
- **核心参数**: `sec_user_id`, `max_cursor`, `count`
- **分页字段**: `has_more`, `max_cursor`, `aweme_list`
- **完整说明**: [`profile_api.md`](./profile_api.md)

该接口的成功请求还包含浏览器会话参数和逐请求变化的校验值。仅复制业务参数不能保证直连成功；完整要求、实测分页证据和限制以独立文档为准。

## 4. 请求头与会话要求

下载和 API 请求通常需要以下请求头：
- `Referer`: `https://www.douyin.com/`
- `User-Agent`: Desktop Chrome User Agent
- `Cookie`: 当前、已授权的网页会话 Cookie（如接口确实需要）

Cookie、token、签名和临时 CDN URL 不得写入仓库、fixture 或公开日志。

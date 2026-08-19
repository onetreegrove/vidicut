# 抖音视频切片抓取与监控系统 - Web管理平台与 MySQL 架构重构设计方案

> **文档版本**: v1.0  
> **更新日期**: 2026-08-19  
> **状态**: 方案已确认，待实施落地  

---

## 1. 概述与设计背景 (Executive Summary)

为了提升项目的可视化管理能力、任务调度的灵活性以及素材元数据的快速检索效率，决定将当前的“静态配置文件（`targets.json` + `monitor_state.json`）”模式重构升级为 **“MySQL 统一数据中枢 + Web 控制台 + Supervisord 守护进程”** 的现代化全栈应用架构。

全新系统支持：
- 动态添加/删除/启用/停用监控博主与抓取任务；
- 前端使用 **Vue 3 + TypeScript + Tailwind CSS v4 + shadcn-vue** 提供高保真深色极客风格管理面板；
- 所有博主配置、任务记录、落盘视频/图片集元数据及轮巡日志全量存储于 **MySQL** 数据库；
- 保持原有的单进程串行队列、平滑休眠（Jitter Delay）及防风控机制不变。

---

## 2. 总体系统架构 (System Architecture)

```mermaid
graph TD
    User[用户 Browser] <-->|HTTP / SSE| WebUI[Vue3 + TS + Tailwind4 + shadcn-vue 前端]
    WebUI <-->|REST API / SSE 日志| API[Node.js / Bun Express/Hono API 后端 (Port 3001)]
    API <-->|SQL 查询 & 更新| DB[(MySQL 8.0+ 数据库)]
    
    Daemon[Supervisord 守护进程 dy_monitor_daemon] <-->|定时查询激活博主 & 记录状态| DB
    Daemon -->|启动抓取作业| Engine[抖音抓取引擎 dy_downloader.ts]
    Engine -->|文件落盘| Storage[本地磁盘 ./downloads]
    Engine -->|元数据入库| DB
```

### 核心架构层说明
1. **数据中枢层 (MySQL)**：持久化存储博主列表、任务历史、作品元数据与巡检日志；
2. **Web 管理服务层 (API Server)**：提供 REST API 接口服务与 SSE (Server-Sent Events) 实时日志推流；
3. **前端控制台 (Web Console)**：提供可视化看板、博主任务 CRUD、全量抓取手动触发以及媒体素材在线预览；
4. **后台守护与抓取引擎 (Daemon & Downloader Engine)**：基于 Supervisord 托管的单进程守护逻辑，定时与 MySQL 交互，保持严格的单线程串行队列与防风控等待。

---

## 3. 数据库表结构设计 (MySQL Schema Design)

数据库命名为：`cut_video_db`，字符集使用 `utf8mb4`。

### 3.1 目标博主表 (`authors`)
存储需监控或已抓取的博主基本信息与轮巡状态。

```sql
CREATE TABLE IF NOT EXISTS `authors` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `sec_user_id` VARCHAR(128) NOT NULL UNIQUE COMMENT '抖音博主 sec_user_id',
  `nickname` VARCHAR(64) NOT NULL COMMENT '博主昵称',
  `avatar_url` VARCHAR(512) DEFAULT NULL COMMENT '头像地址',
  `status` ENUM('active', 'disabled') DEFAULT 'active' COMMENT '状态：active-开启监控, disabled-停用监控',
  `check_interval_minutes` INT DEFAULT 360 COMMENT '巡检周期(分钟)',
  `item_count` INT DEFAULT 10 COMMENT '每次增量检测的作品条数',
  `last_check_date` VARCHAR(10) DEFAULT NULL COMMENT '最近一次成功巡检日期 (YYYY-MM-DD)',
  `last_check_time` DATETIME DEFAULT NULL COMMENT '最近巡检具体时间',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='目标博主配置表';
```

### 3.2 抓取任务工单表 (`download_tasks`)
记录发起的“全量抓取”或“增量巡检”任务历史及实时进度。

```sql
CREATE TABLE IF NOT EXISTS `download_tasks` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `author_id` INT NOT NULL COMMENT '关联博主 ID',
  `sec_user_id` VARCHAR(128) NOT NULL COMMENT '抖音博主 sec_user_id',
  `task_type` ENUM('full', 'incremental') NOT NULL COMMENT '任务类型：full-全量, incremental-增量',
  `status` ENUM('pending', 'running', 'success', 'failed', 'canceled') DEFAULT 'pending' COMMENT '任务状态',
  `total_items` INT DEFAULT 0 COMMENT '作品总数',
  `downloaded_items` INT DEFAULT 0 COMMENT '已下载作品数',
  `log_output` LONGTEXT DEFAULT NULL COMMENT '任务实时/最终运行日志片段',
  `started_at` DATETIME DEFAULT NULL,
  `finished_at` DATETIME DEFAULT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`author_id`) REFERENCES `authors`(`id`) ON DELETE CASCADE,
  INDEX `idx_status` (`status`),
  INDEX `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='抓取任务工单表';
```

### 3.3 作品元数据表 (`media_items`)
聚合全量作品 `info.json` 的关键数据，提供高效索引与组合查询。

```sql
CREATE TABLE IF NOT EXISTS `media_items` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `aweme_id` VARCHAR(64) NOT NULL UNIQUE COMMENT '抖音作品 Aweme ID',
  `author_id` INT NOT NULL COMMENT '关联博主 ID',
  `sec_user_id` VARCHAR(128) NOT NULL,
  `title` VARCHAR(512) DEFAULT NULL COMMENT '作品标题',
  `mix_name` VARCHAR(128) DEFAULT '单视频' COMMENT '所属合集名称',
  `media_type` ENUM('video', 'images') DEFAULT 'video' COMMENT '媒体类型',
  `cover_path` VARCHAR(512) DEFAULT NULL COMMENT '封面相对路径',
  `media_path` VARCHAR(512) DEFAULT NULL COMMENT '主媒体相对路径',
  `duration_ms` INT DEFAULT 0 COMMENT '视频时长(毫秒)',
  `published_at` DATETIME DEFAULT NULL COMMENT '作品发布时间',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`author_id`) REFERENCES `authors`(`id`) ON DELETE CASCADE,
  INDEX `idx_aweme_id` (`aweme_id`),
  INDEX `idx_author_id` (`author_id`),
  INDEX `idx_mix_name` (`mix_name`),
  INDEX `idx_published_at` (`published_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='作品元数据表';
```

### 3.4 守护进程巡检日志表 (`monitor_logs`)
记录守护进程（Supervisor Daemon）的轮巡事件日志。

```sql
CREATE TABLE IF NOT EXISTS `monitor_logs` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `author_id` INT DEFAULT NULL,
  `cycle_index` INT DEFAULT 0 COMMENT '轮巡批次号',
  `log_level` ENUM('INFO', 'WARN', 'ERROR') DEFAULT 'INFO',
  `message` TEXT NOT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='守护进程巡检日志表';
```

---

## 4. 前端应用架构与 UI 规划 (Frontend Spec)

前端应用放置于根目录下的 `./web/` 文件夹。

### 4.1 技术选型
- **框架**: Vue 3 (`<script setup lang="ts">`)
- **构建工具**: Vite 6+
- **CSS 框架**: **Tailwind CSS v4** (`@tailwindcss/vite`)
- **UI 组件库**: **`shadcn-vue`** (搭配 Lucide Vue Icons & Radix Vue)
- **状态与路由**: Vue Router 4 + Pinia

### 4.2 核心页面与功能模块
1. **仪表盘 (Dashboard - `/`)**:
   - 核心数据指标卡片 (Card Component)：总博主数、激活监控数、总已下载作品数、磁盘文件数；
   - 守护进程状态指示器（显示 PID、连续运行时间、当前轮巡批次、下一次轮巡倒计时）；
   - 实时日志监控面板（基于 SSE 协议实时滚动展示守护进程 log）。
2. **博主与任务管理 (Targets & Tasks - `/targets`)**:
   - 博主表格 (DataTable)：显示博主昵称、SecUID、监控状态、最近检查时间、累计下载数；
   - **新增博主弹窗 (Dialog)**：输入抖音博主主页链接或 `sec_user_id`，提交后自动检测博主昵称，创建监控记录并排队触发全量抓取；
   - **操作列**：
     - 开关按钮：切换 `active` / `disabled` 状态；
     - 立即抓取：强制触发一次单博主增量/全量抓取；
     - 删除按钮：删除博主记录（弹窗确认，可勾选是否同时清理本地磁盘数据）。
3. **媒体资源库 (Media Gallery - `/gallery`)**:
   - 筛选项：按博主下拉框、按合集下拉框、作品标题搜索框；
   - 资源网格/列表视图 (Grid / Table View)：展示作品封面、标题、发布时间、所属合集；
   - 视频/图集预览弹窗：点击卡片即调起原生的视频播放组件在线观看落盘 MP4 文件。

---

## 5. 后端 API 与服务架构 (Backend Spec)

后端 Node.js / Bun 服务部署于 `./server/` 目录，监听端口 `3001`。

### 5.1 核心 RESTful API 接口设计

| 方法 | 路由 | 接口功能说明 |
| :---: | :--- | :--- |
| **GET** | `/api/dashboard/stats` | 获取系统概览指标统计数据 |
| **GET** | `/api/authors` | 获取博主列表 (支持分页与状态筛选) |
| **POST** | `/api/authors` | 添加新博主 (自动解析昵称，写入数据库) |
| **PATCH** | `/api/authors/:id` | 修改博主配置 (切换 active 状态、调整巡检周期) |
| **DELETE**| `/api/authors/:id` | 删除博主记录及关联任务/作品 |
| **POST** | `/api/tasks/trigger` | 手动触发指定博主抓取工单 (全量/增量) |
| **GET** | `/api/tasks` | 获取抓取工单列表及进度 |
| **GET** | `/api/media` | 条件查询与搜索作品明细 (支持分页) |
| **GET** | `/api/logs/stream` | SSE (Server-Sent Events) 守护进程/任务日志实时流 |

---

## 6. 守护进程重构 (Daemon Refactoring)

重构 [**`./supervisord/dy_monitor_daemon.ts`**](file:///Users/justonetree/workspace/cut-video/supervisord/dy_monitor_daemon.ts)：
1. **目标加载变动**：移除从静态 `targets.json` 读取目标的逻辑，改为每轮巡检开始时从 MySQL 数据库查询 `SELECT * FROM authors WHERE status = 'active'`；
2. **状态更新变动**：移除对 `monitor_state.json` 的本地写盘，巡检完成或跳过时，直接更新 MySQL 中 `authors` 表的 `last_check_date` 及 `last_check_time`；
3. **日志记录变动**：关键事件同步写入 MySQL `monitor_logs` 表，便于 Web 控制台查询展示；
4. **PID 锁与防风控**：保留 `/tmp/douyin_monitor_daemon.pid` 锁机制与博主间 15s~20s 的打散随机休眠。

---

## 7. 历史数据无损迁移方案 (Migration Plan)

新建迁移脚本 `scripts/init_mysql_migration.ts`：

1. **博主迁移**：
   - 读取 [**`./supervisord/targets.json`**](file:///Users/justonetree/workspace/cut-video/supervisord/targets.json) 中已有的 12 位博主数据；
   - 执行 `INSERT IGNORE INTO authors (sec_user_id, nickname, status)` 批量导入 MySQL。
2. **已下载作品元数据迁移**：
   - 自动递归扫描 `./downloads/{博主名}/` 目录下已存在的全部 `info.json` 档案；
   - 提取 `aweme_id`, `title`, `mix_name`, `published_at`, 文件相对路径，批量 `INSERT IGNORE INTO media_items`；
   - 确保原有数千条离线视频数据 100% 完整的呈现于 Web 管理平台中。

---

## 8. 实施路径 (Implementation Roadmap)

- **阶段 1**: 配置环境 `.env` (MySQL 连接参数)，编写 SQL 建表脚本及迁移程序，完成 12 位博主与离线数据的全量导入；
- **阶段 2**: 编写并测试 `./server/` 模块（API 接口、MySQL 连接池、任务串行队列与 SSE 日志流）；
- **阶段 3**: 初始化 `./web/` Vue 3 + Tailwind v4 + shadcn-vue 前端工程，开发 Dashboard、Targets、Gallery 页面；
- **阶段 4**: 重构 `./supervisord/dy_monitor_daemon.ts` 守护进程，配置 `./supervisord/supervisord.conf` 联动托管；
- **阶段 5**: 全流程集成联调与测试验证。

---
*文档生成完成。*

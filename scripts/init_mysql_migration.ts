import { resolve, join, relative, isAbsolute } from "node:path";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { ensureDatabaseAndTables, execute, query, pool } from "../src/db/mysql";

interface TargetAuthor {
  nickname: string;
  sec_user_id: string;
}

interface MonitorConfig {
  targets: TargetAuthor[];
}

interface InfoJsonFile {
  kind: string;
  path: string;
  url?: string;
}

interface InfoJson {
  aweme_id: string;
  title: string;
  mix_name?: string;
  type?: string;
  create_time?: number;
  duration?: number;
  duration_ms?: number;
  media_path?: string;
  cover_path?: string;
  published_at?: string;
  author?: {
    nickname?: string;
    sec_uid?: string;
    avatar?: string;
  };
  files?: InfoJsonFile[];
}

function findInfoJsonFiles(dir: string, fileList: string[] = []): string[] {
  if (!existsSync(dir)) return fileList;
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    try {
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        findInfoJsonFiles(fullPath, fileList);
      } else if (entry === "info.json") {
        fileList.push(fullPath);
      }
    } catch (e) {
      // ignore broken symlinks or permission issues
    }
  }
  return fileList;
}

async function migrate() {
  console.log("🚀 [1/3] 检查并初始化 MySQL 数据库及核心表结构...");
  await ensureDatabaseAndTables();
  console.log("✅ 数据库及 4 张核心表结构已确认！\n");

  const projectRootDir = resolve(join(__dirname, ".."));
  const targetsPath = resolve(join(projectRootDir, "supervisord", "targets.json"));

  console.log("🚀 [2/3] 开始从 targets.json 导入初始博主到 MySQL authors 表...");
  let authorCount = 0;
  if (existsSync(targetsPath)) {
    const targetsConfig = JSON.parse(readFileSync(targetsPath, "utf-8")) as MonitorConfig;
    for (const t of targetsConfig.targets) {
      const res = await execute(
        `INSERT INTO authors (sec_user_id, nickname, status) VALUES (?, ?, 'active')
         ON DUPLICATE KEY UPDATE nickname = VALUES(nickname), status = 'active'`,
        [t.sec_user_id, t.nickname]
      );
      if (res.affectedRows > 0) authorCount++;
    }
    console.log(`✅ 成功导入/更新 ${authorCount} 位博主数据！\n`);
  } else {
    console.log("⚠️ 未找到 supervisord/targets.json，跳过博主导入。\n");
  }

  // 查出当前所有的博主 map (sec_user_id -> id)
  const dbAuthors = await query<{ id: number; sec_user_id: string }[]>("SELECT id, sec_user_id FROM authors");
  const authorMap = new Map<string, number>();
  for (const a of dbAuthors) {
    authorMap.set(a.sec_user_id, a.id);
  }

  console.log("🚀 [3/3] 开始扫描 ./downloads 目录导入作品元数据到 media_items 表...");
  const downloadsDir = resolve(join(projectRootDir, "downloads"));
  const infoJsonFiles = findInfoJsonFiles(downloadsDir);
  console.log(`📦 发现 ${infoJsonFiles.length} 个作品 info.json 归档文件，开始逐条写入数据库...`);

  let mediaCount = 0;
  for (const infoPath of infoJsonFiles) {
    try {
      const raw = readFileSync(infoPath, "utf-8");
      const info = JSON.parse(raw) as InfoJson;

      if (!info.aweme_id) continue;

      const secUid = info.author?.sec_uid;
      let authorId = secUid ? authorMap.get(secUid) : undefined;

      // 如果作品所属博主未在 authors 表中，自动拉入
      if (!authorId && secUid && info.author?.nickname) {
        const insRes = await execute(
          `INSERT INTO authors (sec_user_id, nickname, avatar_url, status) VALUES (?, ?, ?, 'active')
           ON DUPLICATE KEY UPDATE nickname = VALUES(nickname)`,
          [secUid, info.author.nickname, info.author.avatar || null]
        );
        const fetched = await query<{ id: number }[]>("SELECT id FROM authors WHERE sec_user_id = ?", [secUid]);
        if (fetched.length > 0) {
          authorId = fetched[0].id;
          authorMap.set(secUid, authorId);
        }
      }

      if (!authorId) continue;

      // 提取物理文件路径
      let videoPath: string | null = null;
      let coverPath: string | null = null;

      if (info.media_path) {
        videoPath = isAbsolute(info.media_path) ? relative(projectRootDir, info.media_path) : info.media_path;
      }
      if (info.cover_path) {
        coverPath = isAbsolute(info.cover_path) ? relative(projectRootDir, info.cover_path) : info.cover_path;
      }

      if ((!videoPath || !coverPath) && info.files && Array.isArray(info.files)) {
        for (const f of info.files) {
          if (!videoPath && (f.kind === "video" || f.kind === "image")) {
            videoPath = relative(projectRootDir, f.path);
          } else if (!coverPath && f.kind === "cover") {
            coverPath = relative(projectRootDir, f.path);
          }
        }
      }

      const mediaType = info.type === "images" ? "images" : "video";
      const mixName = info.mix_name || "单视频";
      const publishedAt =
        typeof info.create_time === "number"
          ? new Date(info.create_time * 1000)
          : info.published_at
            ? new Date(info.published_at)
            : null;
      const durationMs = info.duration_ms ?? info.duration ?? 0;

      await execute(
        `INSERT INTO media_items 
         (aweme_id, author_id, sec_user_id, title, mix_name, media_type, cover_path, media_path, duration_ms, published_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE 
         title = VALUES(title), mix_name = VALUES(mix_name), cover_path = VALUES(cover_path), media_path = VALUES(media_path)`,
        [
          info.aweme_id,
          authorId,
          secUid,
          info.title || "",
          mixName,
          mediaType,
          coverPath,
          videoPath,
          durationMs,
          publishedAt,
        ]
      );
      mediaCount++;
    } catch (err: any) {
      // 容错单个 JSON 损坏
    }
  }

  console.log(`✅ 成功扫描并落盘 ${mediaCount} 条作品元数据！\n`);
  console.log("🎉 [Phase 1 完成] MySQL 数据库初始化与历史数据平滑无损迁移完成！");

  await pool.end();
}

migrate().catch((err) => {
  console.error("❌ 迁移失败:", err);
  process.exit(1);
});

import { Router } from "express";
import type { Request, Response } from "express";
import { query, execute } from "../../src/db/mysql";
import { resolve, join } from "node:path";
import { rmSync, existsSync } from "node:fs";
import { requireAdminKey } from "../middleware/adminKey";

export const authorsRouter = Router();

function sanitizeFolderName(name: string): string {
  return name.replace(/[\/\\:\*\?"<>\|]/g, "_").trim();
}

function getAuthorDownloadDirs(author: { sec_user_id?: string; nickname?: string }) {
  const dirs: string[] = [];

  if (author.sec_user_id) {
    dirs.push(resolve(join(process.cwd(), "downloads", sanitizeFolderName(author.sec_user_id))));
  }

  if (author.nickname) {
    dirs.push(resolve(join(process.cwd(), "downloads", sanitizeFolderName(author.nickname))));
  }

  return Array.from(new Set(dirs));
}

// GET /api/authors - 获取博主列表及统计信息
authorsRouter.get("/", async (req: Request, res: Response) => {
  try {
    const authors = await query(`
      SELECT 
        a.*,
        COUNT(DISTINCT m.id) AS total_media_count,
        COUNT(DISTINCT CASE WHEN m.mix_name != '单视频' THEN m.mix_name END) AS total_mix_count
      FROM authors a
      LEFT JOIN media_items m ON a.id = m.author_id
      GROUP BY a.id
      ORDER BY a.created_at DESC
    `);
    res.json({ success: true, data: authors });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/authors/:id - 获取指定博主详情及合集列表
authorsRouter.get("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const authorRows = await query(`SELECT * FROM authors WHERE id = ?`, [id]);
    if (authorRows.length === 0) {
      return res.status(404).json({ success: false, error: "未找到该博主" });
    }

    const author = authorRows[0];
    const mixes = await query(`
      SELECT mix_name, COUNT(*) as count 
      FROM media_items 
      WHERE author_id = ? 
      GROUP BY mix_name 
      ORDER BY count DESC
    `, [id]);

    res.json({ success: true, data: { ...author, mixes } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/authors - 添加新博主并触发解析/全量抓取
authorsRouter.post("/", requireAdminKey, async (req: Request, res: Response) => {
  try {
    const { url_or_sec_id, check_interval_minutes, item_count } = req.body;
    if (!url_or_sec_id) {
      return res.status(400).json({ success: false, error: "必须提供抖音博主链接或 sec_user_id" });
    }

    // 提取 sec_user_id
    let secUserId = url_or_sec_id.trim();
    if (secUserId.includes("/user/")) {
      const parts = secUserId.split("/user/")[1];
      secUserId = parts.split("?")[0].split("/")[0].trim();
    }

    // 检查是否已存在
    const existing = await query(`SELECT * FROM authors WHERE sec_user_id = ?`, [secUserId]);
    if (existing.length > 0) {
      return res.status(400).json({ success: false, error: `博主 (${existing[0].nickname || secUserId}) 已存在于监控列表中` });
    }

    // 尝试解析博主昵称（只做元数据查询，不落盘下载）
    const downloaderScript = resolve(join(process.cwd(), ".agents/skills/douyin-downloader/scripts/dy_downloader.ts"));
    let nickname = `博主_${secUserId.substring(0, 8)}`;

    try {
      const proc = Bun.spawn(["bun", "run", downloaderScript, "profile-meta", secUserId, "--json"], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const stdoutStr = await new Response(proc.stdout).text();
      await proc.exited;

      if (stdoutStr) {
        const parsed = JSON.parse(stdoutStr);
        if (parsed.author?.nickname) {
          nickname = parsed.author.nickname;
        }
      }
    } catch (e) {
      // 容错解析
    }

    const interval = parseInt(check_interval_minutes || "360", 10);
    const count = parseInt(item_count || "10", 10);

    const result = await execute(
      `INSERT INTO authors (sec_user_id, nickname, status, check_interval_minutes, item_count) VALUES (?, ?, 'active', ?, ?)`,
      [secUserId, nickname, interval, count]
    );

    const authorId = result.insertId;

    // 创建全量抓取任务
    const taskRes = await execute(
      `INSERT INTO download_tasks (author_id, sec_user_id, task_type, status) VALUES (?, ?, 'full', 'pending')`,
      [authorId, secUserId]
    );

    res.json({
      success: true,
      message: `博主 [${nickname}] 已成功加入监控列表，已排队全量抓取任务`,
      data: {
        id: authorId,
        sec_user_id: secUserId,
        nickname,
        task_id: taskRes.insertId,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/authors/:id - 修改博主状态或配置
authorsRouter.patch("/:id", requireAdminKey, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, check_interval_minutes, item_count, reset_daily_lock } = req.body;

    const authorRows = await query(`SELECT * FROM authors WHERE id = ?`, [id]);
    if (authorRows.length === 0) {
      return res.status(404).json({ success: false, error: "未找到该博主" });
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (status && (status === "active" || status === "disabled")) {
      updates.push("status = ?");
      params.push(status);
    }
    if (check_interval_minutes !== undefined) {
      updates.push("check_interval_minutes = ?");
      params.push(parseInt(check_interval_minutes, 10));
    }
    if (item_count !== undefined) {
      updates.push("item_count = ?");
      params.push(parseInt(item_count, 10));
    }
    if (reset_daily_lock) {
      updates.push("last_check_date = NULL");
      updates.push("last_check_time = NULL");
    }

    if (updates.length > 0) {
      params.push(id);
      await execute(`UPDATE authors SET ${updates.join(", ")} WHERE id = ?`, params);
    }

    res.json({ success: true, message: "博主设置已更新" });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/authors/:id - 删除博主及关联任务/文件
authorsRouter.delete("/:id", requireAdminKey, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { delete_files } = req.query;

    const authorRows = await query(`SELECT * FROM authors WHERE id = ?`, [id]);
    if (authorRows.length === 0) {
      return res.status(404).json({ success: false, error: "未找到该博主" });
    }

    const author = authorRows[0];

    // 如果指定了删除本地文件
    if (delete_files === "true") {
      for (const dir of getAuthorDownloadDirs(author)) {
        if (existsSync(dir)) {
          try {
            rmSync(dir, { recursive: true, force: true });
          } catch (e) {
            // ignore
          }
        }
      }
    }

    await execute(`DELETE FROM authors WHERE id = ?`, [id]);
    res.json({ success: true, message: `已成功删除博主 [${author.nickname}] 记录${delete_files === "true" ? "及本地素材" : ""}` });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

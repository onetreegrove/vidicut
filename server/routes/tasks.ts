import { Router } from "express";
import type { Request, Response } from "express";
import { query, execute } from "../../src/db/mysql";
import { requireAdminKey } from "../middleware/adminKey";
import { resolve, join, relative } from "node:path";
import { readFileSync, existsSync } from "node:fs";

export const tasksRouter = Router();

// GET /api/tasks - 获取抓取任务工单历史
tasksRouter.get("/", async (req: Request, res: Response) => {
  try {
    const tasks = await query(`
      SELECT 
        t.*,
        a.nickname
      FROM download_tasks t
      LEFT JOIN authors a ON t.author_id = a.id
      ORDER BY t.created_at DESC
      LIMIT 100
    `);
    res.json({ success: true, data: tasks });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/tasks/trigger - 手动触发全量或增量抓取任务
tasksRouter.post("/trigger", requireAdminKey, async (req: Request, res: Response) => {
  try {
    const { author_id, task_type } = req.body;
    if (!author_id) {
      return res.status(400).json({ success: false, error: "必须提供博主 ID" });
    }

    const type = task_type === "full" ? "full" : "incremental";
    const authorRows = await query(`SELECT * FROM authors WHERE id = ?`, [author_id]);
    if (authorRows.length === 0) {
      return res.status(404).json({ success: false, error: "未找到该博主" });
    }

    const author = authorRows[0];

    // 清除单日防重复锁以允许立即抓取
    await execute(`UPDATE authors SET last_check_date = NULL, last_check_time = NULL WHERE id = ?`, [author_id]);

    const result = await execute(
      `INSERT INTO download_tasks (author_id, sec_user_id, task_type, status) VALUES (?, ?, ?, 'pending')`,
      [author_id, author.sec_user_id, type]
    );

    res.json({
      success: true,
      message: `已为博主 [${author.nickname}] 成功创建 ${type === "full" ? "全量" : "增量"}抓取任务`,
      data: {
        task_id: result.insertId,
        author_id,
        nickname: author.nickname,
        task_type: type,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

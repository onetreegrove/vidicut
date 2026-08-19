import { Router } from "express";
import type { Request, Response } from "express";
import { query } from "../../src/db/mysql";

export const logsRouter = Router();

// GET /api/logs/stream - SSE 实时日志推流
logsRouter.get("/stream", async (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");

  let lastLogId = 0;

  // 发送初始历史日志 (近 50 条)
  try {
    const initialLogs = await query(
      `SELECT l.*, a.nickname FROM monitor_logs l LEFT JOIN authors a ON l.author_id = a.id ORDER BY l.id DESC LIMIT 50`
    );
    initialLogs.reverse();
    if (initialLogs.length > 0) {
      lastLogId = initialLogs[initialLogs.length - 1].id;
      res.write(`data: ${JSON.stringify({ type: "history", logs: initialLogs })}\n\n`);
    }
  } catch (e) {
    // ignore
  }

  // 轮询推流增量日志
  const timer = setInterval(async () => {
    try {
      const newLogs = await query(
        `SELECT l.*, a.nickname FROM monitor_logs l LEFT JOIN authors a ON l.author_id = a.id WHERE l.id > ? ORDER BY l.id ASC LIMIT 20`,
        [lastLogId]
      );
      if (newLogs.length > 0) {
        lastLogId = newLogs[newLogs.length - 1].id;
        res.write(`data: ${JSON.stringify({ type: "new", logs: newLogs })}\n\n`);
      }
    } catch (e) {
      // ignore
    }
  }, 2000);

  req.on("close", () => {
    clearInterval(timer);
  });
});

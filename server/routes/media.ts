import { Router } from "express";
import type { Request, Response } from "express";
import { query } from "../../src/db/mysql";

export const mediaRouter = Router();

// GET /api/media - 分页检索作品列表
mediaRouter.get("/", async (req: Request, res: Response) => {
  try {
    const page = parseInt((req.query.page as string) || "1", 10);
    const pageSize = parseInt((req.query.page_size as string) || "24", 10);
    const authorId = req.query.author_id ? parseInt(req.query.author_id as string, 10) : null;
    const mixName = req.query.mix_name as string;
    const keyword = req.query.keyword as string;
    const mediaType = req.query.media_type as string;

    const offset = (page - 1) * pageSize;
    const whereConditions: string[] = ["1=1"];
    const params: any[] = [];

    if (authorId) {
      whereConditions.push("m.author_id = ?");
      params.push(authorId);
    }
    if (mixName) {
      whereConditions.push("m.mix_name = ?");
      params.push(mixName);
    }
    if (keyword) {
      whereConditions.push("m.title LIKE ?");
      params.push(`%${keyword}%`);
    }
    if (mediaType && (mediaType === "video" || mediaType === "images")) {
      whereConditions.push("m.media_type = ?");
      params.push(mediaType);
    }

    const whereSql = whereConditions.join(" AND ");

    // 总数统计
    const countRows = await query<{ count: number }[]>(
      `SELECT COUNT(*) as count FROM media_items m WHERE ${whereSql}`,
      params
    );
    const total = countRows[0]?.count || 0;

    // 分页数据
    const items = await query(
      `SELECT 
        m.*,
        a.nickname AS author_nickname,
        a.avatar_url AS author_avatar
       FROM media_items m
       LEFT JOIN authors a ON m.author_id = a.id
       WHERE ${whereSql}
       ORDER BY m.published_at DESC, m.id DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    res.json({
      success: true,
      data: {
        items,
        pagination: {
          page,
          page_size: pageSize,
          total,
          total_pages: Math.ceil(total / pageSize),
        },
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/media/mixes - 获取所有的合集分类列表
mediaRouter.get("/mixes", async (req: Request, res: Response) => {
  try {
    const authorId = req.query.author_id ? parseInt(req.query.author_id as string, 10) : null;
    let sql = `SELECT mix_name, COUNT(*) as count FROM media_items `;
    const params: any[] = [];
    if (authorId) {
      sql += `WHERE author_id = ? `;
      params.push(authorId);
    }
    sql += `GROUP BY mix_name ORDER BY count DESC`;

    const mixes = await query(sql, params);
    res.json({ success: true, data: mixes });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

import express from "express";
import cors from "cors";
import { resolve, join } from "node:path";
import { authorsRouter } from "./routes/authors";
import { tasksRouter } from "./routes/tasks";
import { mediaRouter } from "./routes/media";
import { logsRouter } from "./routes/logs";
import { query, ensureDatabaseAndTables } from "../src/db/mysql";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 静态部署下载好的媒体文件 (用于 Web 端在线播放 mp4 与预览图片)
app.use("/downloads", express.static(resolve(join(process.cwd(), "downloads"))));

// API 路由挂载
app.use("/api/authors", authorsRouter);
app.use("/api/tasks", tasksRouter);
app.use("/api/media", mediaRouter);
app.use("/api/logs", logsRouter);

// Dashboard 统计 Summary API
app.get("/api/dashboard/stats", async (req, res) => {
  try {
    const authorsCount = await query<{ count: number }[]>("SELECT COUNT(*) as count FROM authors");
    const activeAuthorsCount = await query<{ count: number }[]>("SELECT COUNT(*) as count FROM authors WHERE status = 'active'");
    const mediaCount = await query<{ count: number }[]>("SELECT COUNT(*) as count FROM media_items");
    const tasksCount = await query<{ count: number }[]>("SELECT COUNT(*) as count FROM download_tasks");
    const mixesCount = await query<{ count: number }[]>("SELECT COUNT(DISTINCT mix_name) as count FROM media_items WHERE mix_name != '单视频'");

    res.json({
      success: true,
      data: {
        total_authors: authorsCount[0]?.count || 0,
        active_authors: activeAuthorsCount[0]?.count || 0,
        total_media: mediaCount[0]?.count || 0,
        total_tasks: tasksCount[0]?.count || 0,
        total_mixes: mixesCount[0]?.count || 0,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

async function bootstrap() {
  await ensureDatabaseAndTables();
  app.listen(PORT, () => {
    console.log(`🚀 Web API 后端服务启动成功！监听端口: http://localhost:${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error("❌ Web API 启动失败:", err);
  process.exit(1);
});

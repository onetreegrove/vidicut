import { resolve, join } from "node:path";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { query, execute } from "../src/db/mysql";

interface AuthorRecord {
  id: number;
  sec_user_id: string;
  nickname: string;
  check_interval_minutes: number;
  item_count: number;
  last_check_date: string | null;
  last_check_time: string | Date | null;
  status: "active" | "disabled";
}

interface TaskRecord {
  id: number;
  author_id: number;
  sec_user_id: string;
  task_type: "full" | "incremental";
  status: "pending" | "running" | "success" | "failed";
}

const PID_FILE = "/tmp/douyin_monitor_daemon.pid";

async function logToDb(message: string, level: "INFO" | "WARN" | "ERROR" = "INFO", authorId: number | null = null, cycleIndex = 0) {
  const timestamp = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
  console.log(`[${timestamp}] ${message}`);
  try {
    await execute(
      `INSERT INTO monitor_logs (author_id, cycle_index, log_level, message) VALUES (?, ?, ?, ?)`,
      [authorId, cycleIndex, level, message]
    );
  } catch (e) {
    // 容错写日志
  }
}

function getTodayString(): string {
  const now = new Date();
  const options: Intl.DateTimeFormatOptions = {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  };
  return new Intl.DateTimeFormat("en-CA", options).format(now);
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

function getCheckIntervalMs(author: AuthorRecord): number {
  const minutes = Number(author.check_interval_minutes || 360);
  return Math.max(1, minutes) * 60 * 1000;
}

function isAuthorCheckDue(author: AuthorRecord): boolean {
  if (!author.last_check_time) {
    return true;
  }

  const lastCheckTs = new Date(author.last_check_time).getTime();
  if (Number.isNaN(lastCheckTs)) {
    return true;
  }

  return Date.now() - lastCheckTs >= getCheckIntervalMs(author);
}

function acquirePidLock() {
  if (existsSync(PID_FILE)) {
    try {
      const oldPid = parseInt(readFileSync(PID_FILE, "utf-8").trim(), 10);
      if (!isNaN(oldPid)) {
        try {
          process.kill(oldPid, 0);
          console.log(`🛑 警告: 监测到已有一个守护进程在运行 (PID: ${oldPid})，本实例退出。`);
          process.exit(0);
        } catch (e) {
          // PID 已经不存在，锁失效
        }
      }
    } catch (e) {
      // ignore
    }
  }
  writeFileSync(PID_FILE, String(process.pid));

  const cleanup = () => {
    try {
      if (existsSync(PID_FILE)) {
        const filePid = parseInt(readFileSync(PID_FILE, "utf-8").trim(), 10);
        if (filePid === process.pid) {
          unlinkSync(PID_FILE);
        }
      }
    } catch (e) {
      // ignore
    }
  };

  process.on("exit", cleanup);
  process.on("SIGINT", () => { cleanup(); process.exit(0); });
  process.on("SIGTERM", () => { cleanup(); process.exit(0); });
}

async function runProfileCheck(secUserId: string, nickname: string, count: number, isFull = false): Promise<boolean> {
  const downloaderScript = resolve(join(import.meta.dir, "../.agents/skills/douyin-downloader/scripts/dy_downloader.ts"));
  const outDir = resolve(join(import.meta.dir, "../downloads"));

  const args = [
    "bun",
    "run",
    downloaderScript,
    "profile",
    secUserId,
    "--out",
    outDir,
    "--json",
  ];

  if (isFull) {
    args.push("--all");
  } else {
    args.push("--count", String(count));
  }

  try {
    const proc = Bun.spawn(args, {
      stdout: "pipe",
      stderr: "pipe",
    });

    const outputStr = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    if (exitCode === 0) {
      // 自动触发一次本地文件到 MySQL 的增量同步
      try {
        const syncProc = Bun.spawn(["bun", "run", resolve(join(import.meta.dir, "../scripts/init_mysql_migration.ts"))], {
          stdout: "pipe",
          stderr: "pipe",
        });
        await syncProc.exited;
      } catch (e) {
        // ignore
      }
      return true;
    } else {
      const errStr = await new Response(proc.stderr).text();
      console.error(`⚠️ 博主 [${nickname}] 执行异常: ${errStr.trim()}`);
      return false;
    }
  } catch (err: any) {
    console.error(`❌ 博主 [${nickname}] 抓取失败: ${err?.message || err}`);
    return false;
  }
}

async function processPendingTasks() {
  const pendingTasks = await query<TaskRecord[]>(
    `SELECT * FROM download_tasks WHERE status = 'pending' ORDER BY created_at ASC LIMIT 10`
  );

  for (const task of pendingTasks) {
    await execute(`UPDATE download_tasks SET status = 'running', started_at = NOW() WHERE id = ?`, [task.id]);
    await logToDb(`⚡ [手动/队列工单] 开始执行 Task #${task.id} (${task.task_type === 'full' ? '全量' : '增量'})`, "INFO", task.author_id);

    const authorRows = await query<AuthorRecord[]>(`SELECT * FROM authors WHERE id = ?`, [task.author_id]);
    const nickname = authorRows.length > 0 ? authorRows[0].nickname : task.sec_user_id;

    const ok = await runProfileCheck(task.sec_user_id, nickname, 10, task.task_type === "full");

    if (ok) {
      await execute(`UPDATE download_tasks SET status = 'success', finished_at = NOW() WHERE id = ?`, [task.id]);
      await execute(`UPDATE authors SET last_check_date = ?, last_check_time = NOW() WHERE id = ?`, [getTodayString(), task.author_id]);
      await logToDb(`✅ Task #${task.id} 执行成功 (博主: ${nickname})`, "INFO", task.author_id);
    } else {
      await execute(`UPDATE download_tasks SET status = 'failed', finished_at = NOW() WHERE id = ?`, [task.id]);
      await logToDb(`❌ Task #${task.id} 执行失败 (博主: ${nickname})`, "ERROR", task.author_id);
    }

    await sleep(5000);
  }
}

async function main() {
  acquirePidLock();
  await logToDb("🚀 抖音单进程守护服务启动 (适配 MySQL 动态调度架构)...");

  let cycleIndex = 1;

  while (true) {
    // 1. 先优先处理 Web 提交的 Pending 任务
    await processPendingTasks();

    // 2. 从 MySQL 读取已激活的监控博主
    let activeAuthors: AuthorRecord[] = [];
    try {
      activeAuthors = await query<AuthorRecord[]>(`SELECT * FROM authors WHERE status = 'active' ORDER BY id ASC`);
    } catch (e: any) {
      await logToDb(`⚠️ 查询 authors 表失败: ${e.message}，5分钟后重试...`, "WARN");
      await sleep(5 * 60 * 1000);
      continue;
    }

    const todayStr = getTodayString();
    await logToDb(`══════════════════════════════════════════════════`, "INFO", null, cycleIndex);
    await logToDb(`🔄 开始第 #${cycleIndex} 轮巡检 (当前日期: ${todayStr}, 共 ${activeAuthors.length} 个激活博主)`, "INFO", null, cycleIndex);
    await logToDb(`══════════════════════════════════════════════════`, "INFO", null, cycleIndex);

    for (let i = 0; i < activeAuthors.length; i++) {
      // 再次检查是否有插队任务
      await processPendingTasks();

      const author = activeAuthors[i];

      // 按配置的巡检间隔校验
      if (!isAuthorCheckDue(author)) {
        const intervalMs = getCheckIntervalMs(author);
        const lastCheckTs = author.last_check_time ? new Date(author.last_check_time).getTime() : Date.now();
        const nextCheckAt = new Date(lastCheckTs + intervalMs).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
        await logToDb(`🔒 博主 [${author.nickname}] 尚未到巡检间隔 -> 下次可执行时间 ${nextCheckAt}`, "INFO", author.id, cycleIndex);
      } else {
        await logToDb(`▶️ 正在巡检博主 [${author.nickname}] (${author.sec_user_id})...`, "INFO", author.id, cycleIndex);
        const ok = await runProfileCheck(author.sec_user_id, author.nickname, author.item_count || 10, false);
        if (ok) {
          await execute(
            `UPDATE authors SET last_check_date = ?, last_check_time = NOW() WHERE id = ?`,
            [todayStr, author.id]
          );
          await logToDb(`✅ 博主 [${author.nickname}] 增量巡检成功`, "INFO", author.id, cycleIndex);
        } else {
          await logToDb(`⚠️ 博主 [${author.nickname}] 增量巡检异常`, "WARN", author.id, cycleIndex);
        }
      }

      // 博主间串行休眠，防风控
      if (i < activeAuthors.length - 1) {
        const delayMs = 15000 + Math.floor(Math.random() * 5000);
        await sleep(delayMs);
      }
    }

    await logToDb(`🎉 第 #${cycleIndex} 轮巡检评估结束。`, "INFO", null, cycleIndex);
    await logToDb(`💤 进入休眠 6 小时，准备下一轮巡检...`, "INFO", null, cycleIndex);

    cycleIndex++;
    await sleep(6 * 60 * 60 * 1000);
  }
}

main();

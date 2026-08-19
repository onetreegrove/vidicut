import mysql from "mysql2/promise";
import { resolve, join } from "node:path";
import { existsSync, readFileSync } from "node:fs";

// 读取环境变量
function loadEnv() {
  const envPath = resolve(process.cwd(), ".env");
  if (existsSync(envPath)) {
    const content = readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    }
  }
}

loadEnv();

const dbHost = process.env.MYSQL_HOST || "127.0.0.1";
const dbPort = parseInt(process.env.MYSQL_PORT || "3306", 10);
const dbUser = process.env.MYSQL_USER || "root";
const dbPassword = process.env.MYSQL_PASSWORD || "";
const dbName = process.env.MYSQL_DATABASE || "cut_video_db";

export const pool = mysql.createPool({
  host: dbHost,
  port: dbPort,
  user: dbUser,
  password: dbPassword,
  database: dbName,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
});

/**
 * 校验并确保数据库及 4 张核心表已建立
 */
export async function ensureDatabaseAndTables(): Promise<void> {
  const initConn = await mysql.createConnection({
    host: dbHost,
    port: dbPort,
    user: dbUser,
    password: dbPassword,
    multipleStatements: true,
  });

  try {
    await initConn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    await initConn.query(`USE \`${dbName}\`;`);

    const schemaPath = resolve(join(__dirname, "schema.sql"));
    if (existsSync(schemaPath)) {
      const schemaSql = readFileSync(schemaPath, "utf-8");
      await initConn.query(schemaSql);
    }
  } finally {
    await initConn.end();
  }
}

export async function query<T = any>(sql: string, params: any[] = []): Promise<T> {
  const [rows] = await pool.query(sql, params);
  return rows as T;
}

export async function execute(sql: string, params: any[] = []): Promise<mysql.ResultSetHeader> {
  const [result] = await pool.execute(sql, params);
  return result as mysql.ResultSetHeader;
}

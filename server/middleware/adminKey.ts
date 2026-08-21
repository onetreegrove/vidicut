import type { Request, Response, NextFunction } from "express";

const ADMIN_KEY_HEADER = "x-admin-api-key";

export function requireAdminKey(req: Request, res: Response, next: NextFunction) {
  const expectedKey = process.env.ADMIN_API_KEY;

  if (!expectedKey) {
    return next();
  }

  const providedKey = req.header(ADMIN_KEY_HEADER);
  if (!providedKey || providedKey !== expectedKey) {
    return res.status(401).json({ success: false, error: "未授权的管理操作" });
  }

  next();
}

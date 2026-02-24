import type { Request, Response, NextFunction } from "express";

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const adminToken = process.env.ADMIN_TOKEN;
  
  // In dev mode without ADMIN_TOKEN, allow access
  if (!adminToken && process.env.NODE_ENV !== "production") {
    return next();
  }

  if (!adminToken) {
    return res.status(500).json({ ok: false, error: "ADMIN_TOKEN not configured" });
  }

  const provided = req.headers["x-admin-token"];
  if (provided !== adminToken) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  next();
}

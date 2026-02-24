// Validates admin token from request header
export function validateAdminToken(req: Request): boolean {
  const adminToken = Deno.env.get("ADMIN_TOKEN");
  if (!adminToken) {
    // In dev mode without ADMIN_TOKEN set, allow access
    console.warn("ADMIN_TOKEN not set — allowing request (dev mode)");
    return true;
  }
  const provided = req.headers.get("x-admin-token");
  return provided === adminToken;
}

import { NextRequest, NextResponse } from "next/server";

/**
 * Verify admin Bearer token on protected routes.
 * Returns null if authorized, or a 401 NextResponse if not.
 */
export function requireAdmin(request: NextRequest): NextResponse | null {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "ADMIN_SECRET not configured" },
      { status: 500 }
    );
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}

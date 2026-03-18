import { updateSybilReview, flagSybil, getPendingSybilFlags, getSybilFlags } from "@/lib/db/queries";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";

/**
 * GET /api/admin/sybil/review — List sybil flags
 * Query params: cohortId (optional), status (optional: "pending"|"approved"|"rejected")
 */
export async function GET(request: NextRequest) {
  const authError = requireAdmin(request);
  if (authError) return authError;
  const cohortId = request.nextUrl.searchParams.get("cohortId") ?? undefined;
  const status = request.nextUrl.searchParams.get("status");

  if (status === "pending") {
    const flags = await getPendingSybilFlags();
    return NextResponse.json({ flags });
  }

  const flags = await getSybilFlags(cohortId);
  return NextResponse.json({ flags });
}

/**
 * POST /api/admin/sybil/review — Approve or reject a sybil flag
 * Body: { flagId, action: "approved"|"rejected", adminWallet, reason? }
 */
export async function POST(request: NextRequest) {
  const authError = requireAdmin(request);
  if (authError) return authError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { flagId, action, adminWallet, reason } = body as {
    flagId?: string;
    action?: string;
    adminWallet?: string;
    reason?: string;
  };

  if (!flagId || !action || !adminWallet) {
    return NextResponse.json(
      { error: "flagId, action, and adminWallet are required." },
      { status: 400 }
    );
  }

  if (action !== "approved" && action !== "rejected") {
    return NextResponse.json(
      { error: "action must be 'approved' or 'rejected'." },
      { status: 400 }
    );
  }

  const result = await updateSybilReview(flagId, action, adminWallet, reason);
  return NextResponse.json({ result });
}

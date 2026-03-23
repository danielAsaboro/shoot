import {
  createAgentApiKey,
  listAgentApiKeys,
  revokeAgentApiKey,
  authenticateAgent,
} from "@/lib/agent/auth";
import { NextRequest, NextResponse } from "next/server";
import { createPublicKey, verify } from "node:crypto";
import bs58 from "bs58";

// ── Helpers ─────────────────────────────────────────────────────────────────

const CHALLENGE_PREFIX = "shoot-agent-key-create:";

/**
 * Verify a Solana wallet signature over a known challenge message.
 * The client signs `"shoot-agent-key-create:<timestamp>"` and sends
 * { wallet, signature, timestamp }.
 */
function verifyWalletSignature(
  wallet: string,
  signature: string,
  timestamp: number
): boolean {
  // Reject if timestamp is older than 5 minutes
  if (Math.abs(Date.now() - timestamp) > 5 * 60 * 1000) return false;

  const message = Buffer.from(`${CHALLENGE_PREFIX}${timestamp}`);
  try {
    const pubkeyBytes = bs58.decode(wallet);
    const sigBytes = bs58.decode(signature);

    // Node.js ed25519 verification via crypto module
    const key = createPublicKey({
      key: Buffer.concat([
        // DER prefix for Ed25519 public key (RFC 8410)
        Buffer.from("302a300506032b6570032100", "hex"),
        Buffer.from(pubkeyBytes),
      ]),
      format: "der",
      type: "spki",
    });

    return verify(null, message, key, Buffer.from(sigBytes));
  } catch {
    return false;
  }
}

// ── POST: Create a new API key ──────────────────────────────────────────────

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { wallet, signature, timestamp, label } = body as {
    wallet?: string;
    signature?: string;
    timestamp?: number;
    label?: string;
  };

  if (!wallet || !signature || !timestamp) {
    return NextResponse.json(
      { error: "wallet, signature, and timestamp are required." },
      { status: 400 }
    );
  }

  if (!verifyWalletSignature(wallet, signature, timestamp)) {
    return NextResponse.json(
      { error: "Invalid wallet signature." },
      { status: 401 }
    );
  }

  const { id, key } = await createAgentApiKey(wallet, label ?? "");

  return NextResponse.json({ id, key }, { status: 201 });
}

// ── GET: List active keys for the authenticated agent ───────────────────────

export async function GET(request: NextRequest) {
  const auth = await authenticateAgent(request.headers.get("authorization"));
  if (!auth) {
    return NextResponse.json(
      { error: "Invalid or missing API key." },
      { status: 401 }
    );
  }

  const keys = await listAgentApiKeys(auth.wallet);
  return NextResponse.json({ keys });
}

// ── DELETE: Revoke a key ────────────────────────────────────────────────────

export async function DELETE(request: NextRequest) {
  const auth = await authenticateAgent(request.headers.get("authorization"));
  if (!auth) {
    return NextResponse.json(
      { error: "Invalid or missing API key." },
      { status: 401 }
    );
  }

  const { keyId } = (await request.json()) as { keyId?: string };
  if (!keyId) {
    return NextResponse.json({ error: "keyId is required." }, { status: 400 });
  }

  const revoked = await revokeAgentApiKey(keyId, auth.wallet);
  if (!revoked) {
    return NextResponse.json(
      { error: "Key not found or already revoked." },
      { status: 404 }
    );
  }

  return NextResponse.json({ revoked: true });
}

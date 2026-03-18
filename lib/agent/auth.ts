import { prisma } from "@/lib/db/client";
import { createHash, randomBytes } from "node:crypto";

const KEY_PREFIX = "shoot_ak_";

function hashKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

export interface AuthResult {
  wallet: string;
  keyId: string;
}

/**
 * Authenticate an agent request via Bearer token.
 * Returns the wallet bound to the API key, or null if invalid.
 */
export async function authenticateAgent(
  authHeader: string | null
): Promise<AuthResult | null> {
  if (!authHeader?.startsWith(`Bearer ${KEY_PREFIX}`)) return null;

  const plaintext = authHeader.slice("Bearer ".length);
  const hash = hashKey(plaintext);

  const key = await prisma.agentApiKey.findUnique({
    where: { keyHash: hash },
    select: { id: true, wallet: true, revokedAt: true },
  });

  if (!key || key.revokedAt) return null;

  // Fire-and-forget: update lastUsedAt
  prisma.agentApiKey
    .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return { wallet: key.wallet, keyId: key.id };
}

/**
 * Generate a new API key for a wallet. Returns the plaintext key (shown once).
 */
export async function createAgentApiKey(
  wallet: string,
  label = ""
): Promise<{ id: string; key: string }> {
  const raw = randomBytes(32).toString("base64url");
  const plaintext = `${KEY_PREFIX}${raw}`;
  const hash = hashKey(plaintext);

  const record = await prisma.agentApiKey.create({
    data: { wallet, keyHash: hash, label },
  });

  return { id: record.id, key: plaintext };
}

/**
 * List active (non-revoked) API keys for a wallet.
 * Does NOT return the plaintext key — only metadata.
 */
export async function listAgentApiKeys(wallet: string) {
  return prisma.agentApiKey.findMany({
    where: { wallet, revokedAt: null },
    select: { id: true, label: true, lastUsedAt: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Revoke an API key. Only the owning wallet can revoke.
 */
export async function revokeAgentApiKey(
  keyId: string,
  wallet: string
): Promise<boolean> {
  const key = await prisma.agentApiKey.findUnique({
    where: { id: keyId },
    select: { wallet: true, revokedAt: true },
  });

  if (!key || key.wallet !== wallet || key.revokedAt) return false;

  await prisma.agentApiKey.update({
    where: { id: keyId },
    data: { revokedAt: new Date() },
  });

  return true;
}

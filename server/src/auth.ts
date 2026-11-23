import type { NextFunction, Request, Response } from "express";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

export interface AuthedRequest extends Request {
  userId?: string;
}

export type TokenVerifier = (token: string) => Promise<{ userId: string }>;

/** Verifies Supabase access tokens, via JWKS (asymmetric keys) or the legacy HS256 secret. */
export function createSupabaseVerifier(opts: { jwksUrl?: string; jwtSecret?: string }): TokenVerifier {
  const key: Uint8Array | JWTVerifyGetKey = opts.jwksUrl
    ? createRemoteJWKSet(new URL(opts.jwksUrl))
    : new TextEncoder().encode(opts.jwtSecret);

  return async (token) => {
    const { payload } = await jwtVerify(token, key as Uint8Array, { audience: "authenticated" });
    if (!payload.sub) throw new Error("Token has no subject");
    return { userId: payload.sub };
  };
}

export function requireAuth(verify: TokenVerifier) {
  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    const header = req.header("authorization") ?? "";
    const [scheme, token] = header.split(" ");
    if (scheme !== "Bearer" || !token) {
      res.status(401).json({ error: "missing_token" });
      return;
    }
    try {
      req.userId = (await verify(token)).userId;
      next();
    } catch {
      res.status(401).json({ error: "invalid_token" });
    }
  };
}

// Request authentication for the vault API.
//
// tide mode: verify the TideCloak access token (signature via the realm's JWKS,
//            issuer, expiry) and use its `sub` as the record owner.
// demo mode: accept the demo user header. Only enabled when no TideCloak adapter
//            config exists, mirroring the frontend.

import { createRemoteJWKSet, jwtVerify } from "jose";

export const DEMO_USER_ID = "demo-user-0001";

export function createAuthenticator(adapterConfig) {
  if (!adapterConfig) {
    return async (req) => {
      if (req.get("authorization") !== `Demo ${DEMO_USER_ID}`) throw new Error("Missing demo credentials");
      return DEMO_USER_ID;
    };
  }

  const authServer = String(adapterConfig["auth-server-url"]).replace(/\/$/, "");
  const issuer = `${authServer}/realms/${adapterConfig.realm}`;
  const jwks = createRemoteJWKSet(new URL(`${issuer}/protocol/openid-connect/certs`));

  return async (req) => {
    const [scheme, token] = String(req.get("authorization") ?? "").split(" ");
    if (!token || !/^(Bearer|DPoP)$/i.test(scheme)) throw new Error("Missing bearer token");
    const { payload } = await jwtVerify(token, jwks, { issuer });
    if (!payload.sub) throw new Error("Token has no subject");
    return payload.sub;
  };
}

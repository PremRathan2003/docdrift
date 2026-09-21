import { createPrivateKey, type KeyObject } from 'node:crypto';
import type { Env } from '../../config/env.js';

export interface GitHubAppConfig {
  appId: string;
  slug: string;
  clientId: string;
  clientSecret: string;
  /** Parsed once at startup; a broken key fails fast instead of on first use. */
  privateKey: KeyObject;
}

/**
 * Returns null when GitHub isn't configured (all variables empty).
 * The private key is stored base64-encoded in one env var because hosting
 * dashboards handle multi-line values badly.
 */
export function loadGitHubConfig(env: Env): GitHubAppConfig | null {
  if (!env.GITHUB_APP_ID) return null;
  const pem = Buffer.from(env.GITHUB_APP_PRIVATE_KEY_BASE64!, 'base64').toString('utf8');
  let privateKey: KeyObject;
  try {
    privateKey = createPrivateKey(pem);
  } catch {
    throw new Error(
      'GITHUB_APP_PRIVATE_KEY_BASE64 is not a valid base64-encoded PEM private key (see docs/GITHUB_APP_SETUP.md)',
    );
  }
  return {
    appId: env.GITHUB_APP_ID,
    slug: env.GITHUB_APP_SLUG!,
    clientId: env.GITHUB_APP_CLIENT_ID!,
    clientSecret: env.GITHUB_APP_CLIENT_SECRET!,
    privateKey,
  };
}

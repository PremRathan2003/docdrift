/**
 * Where to go after login. The value comes from the URL (?next=...), so an
 * attacker could craft a login link that sends the user to their own site
 * afterwards ("open redirect"). We only allow paths on our own site.
 */
export function safeNextPath(raw: string | null | undefined, fallback = '/dashboard'): string {
  if (!raw) return fallback;
  // Must be a single-slash absolute path: "/x" yes; "//evil.com", "/\\evil.com", "https://…" no.
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return fallback;
  try {
    const url = new URL(raw, 'https://docdrift.invalid');
    if (url.origin !== 'https://docdrift.invalid') return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}

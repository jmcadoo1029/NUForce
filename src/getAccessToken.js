// src/getAccessToken.js
//
// Reads a valid Supabase access token straight from the session cookie,
// bypassing supabase-js entirely. Used by the direct-PostgREST bypass for
// the operations that hang inside supabase-js (quote save, rev-check, load,
// dashboard queries, reminders).
//
// WHY THIS EXISTS: supabase-js 2.x (confirmed 2.58 and 2.100) wedges
// getSession() and query operations on a healthy session, upstream of fetch.
// A direct fetch to PostgREST returns instantly during the hang. This helper
// supplies the token for that direct path without touching the broken layer.
//
// FORMAT NOTE: NUForce uses a custom storage adapter (nulabsSessionStorage)
// that stores the session as plain encodeURIComponent'd JSON under the key
// supabase-js chooses. Confirmed on the live instance: the cookie value is
// decodeURIComponent -> JSON.parse-able directly (no base64- prefix, single
// cookie, ~2.4KB). This helper handles that confirmed case AND defensively
// handles the SDK's other possible formats (base64- prefix, chunked .0/.1)
// so it stays correct if the format ever shifts or differs across versions.

const COOKIE_BASE = "sb-swuuxzmgmldvvomsgmjf-auth-token";

// Read one cookie's raw (still URI-encoded) value, or null if absent.
function readRawCookie(name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = document.cookie.match(new RegExp("(?:^|; )" + escaped + "=([^;]*)"));
  return m ? m[1] : null;
}

// Assemble the stored session string, reassembling chunked cookies if present.
function assembleSessionValue() {
  // Unchunked (the confirmed real case) first.
  const single = readRawCookie(COOKIE_BASE);
  if (single !== null) return decodeURIComponent(single);

  // Chunked fallback: COOKIE_BASE.0, .1, .2 …
  let combined = "";
  let i = 0;
  // Hard cap to avoid any pathological infinite loop.
  while (i < 50) {
    const part = readRawCookie(`${COOKIE_BASE}.${i}`);
    if (part === null) break;
    combined += decodeURIComponent(part);
    i++;
  }
  return combined.length ? combined : null;
}

// Parse the assembled value into a session object, or null. Never throws.
function parseSession(rawValue) {
  if (rawValue == null) return null;
  let v = rawValue;
  // The SDK sometimes prefixes a base64- blob; strip and decode if so.
  if (v.startsWith("base64-")) {
    try {
      v = atob(v.slice("base64-".length));
    } catch (_) {
      return null;
    }
  }
  try {
    return JSON.parse(v);
  } catch (_) {
    return null;
  }
}

/**
 * Returns a valid access token (string) read from the session cookie, or
 * null if there is no usable session. Synchronous. Never throws.
 *
 * Returns null when: no cookie, malformed value, missing access_token, or the
 * token is already expired (caller should treat null as "no session" and, if
 * appropriate, bounce to workspace for re-auth).
 */
export function getAccessToken() {
  try {
    const session = parseSession(assembleSessionValue());
    if (!session || !session.access_token) return null;

    if (typeof session.expires_at === "number") {
      const now = Math.floor(Date.now() / 1000);
      if (session.expires_at <= now) return null;
    }
    return session.access_token;
  } catch (_) {
    return null;
  }
}
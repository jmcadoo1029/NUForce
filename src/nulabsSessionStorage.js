// src/nulabsSessionStorage.js
//
// Cookie-based session storage adapter for Supabase Auth, scoped to .nulabs.com
// so the session is shared between nuforce.nulabs.com and workspace.nulabs.com.
//
// Local dev (localhost / 127.0.0.1) falls back to localStorage — subdomain
// cookies don't work for localhost so we accept per-port isolation in dev.
//
// MIGRATION: on first read after deployment, if no cookie exists but a
// Supabase session is still in localStorage (the SDK's previous default),
// the value is moved to the cookie automatically. This prevents existing
// logged-in users from being forcibly signed out by the storage swap.
//
// ERROR POLICY (agreed with Russ, NUWorkspace):
//   - getItem returns null on any error (treat as "no session")
//   - setItem and removeItem wrap in try/catch, log to console, do NOT throw
// Rationale: the Supabase SDK calls setItem during silent token refresh.
// A thrown exception there would crash the refresh and destroy the session.

const COOKIE_DOMAIN = '.nulabs.com';
const COOKIE_PATH = '/';
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

function isLocalDev() {
  const h = window.location.hostname;
  return h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0';
}

function readCookie(name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = document.cookie.match(new RegExp('(?:^|; )' + escaped + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}

function writeCookie(name, value) {
  const encoded = encodeURIComponent(value);
  document.cookie =
    `${name}=${encoded}; Domain=${COOKIE_DOMAIN}; Path=${COOKIE_PATH}; Max-Age=${COOKIE_MAX_AGE_SECONDS}; Secure; SameSite=Lax`;
}

function deleteCookie(name) {
  document.cookie =
    `${name}=; Domain=${COOKIE_DOMAIN}; Path=${COOKIE_PATH}; Max-Age=0; Secure; SameSite=Lax`;
}

const _migrated = Object.create(null);

export const nulabsSessionStorage = {
  getItem(key) {
    try {
      if (isLocalDev()) return localStorage.getItem(key);

      const cookieVal = readCookie(key);
      if (cookieVal !== null) return cookieVal;

      // First-time migration: cookie is empty but the user may still have
      // a valid session in localStorage from the pre-adapter SDK default.
      if (!_migrated[key]) {
        _migrated[key] = true;
        try {
          const lsVal = localStorage.getItem(key);
          if (lsVal !== null) {
            writeCookie(key, lsVal);
            try { localStorage.removeItem(key); } catch (_) { /* ignore */ }
            return lsVal;
          }
        } catch (_) { /* ignore */ }
      }
      return null;
    } catch (e) {
      console.error(`[nulabsSessionStorage] getItem failed for "${key}":`, e);
      return null;
    }
  },

  setItem(key, value) {
    try {
      if (isLocalDev()) {
        localStorage.setItem(key, value);
        return;
      }
      writeCookie(key, value);
    } catch (e) {
      console.error(`[nulabsSessionStorage] setItem failed for "${key}":`, e);
    }
  },

  removeItem(key) {
    try {
      if (isLocalDev()) {
        localStorage.removeItem(key);
        return;
      }
      deleteCookie(key);
    } catch (e) {
      console.error(`[nulabsSessionStorage] removeItem failed for "${key}":`, e);
    }
  },
};

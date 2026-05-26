import { createClient } from "@supabase/supabase-js";
import { nulabsSessionStorage } from "./nulabsSessionStorage";

const SUPABASE_URL = "https://swuuxzmgmldvvomsgmjf.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_bmrPY65INpUkea8VUX1Wag_T7Vrz9ZZ";
const WORKSPACE_URL = "https://workspace.nulabs.com";

// How long a single Supabase fetch may run before we abort it. Any request
// that hasn't returned by this point is treated as hung and rejected so the
// caller's await chain settles instead of suspending forever.
const FETCH_TIMEOUT_MS = 15000;

// Phase 7 fixes for SSO with NUWorkspace (UNCHANGED — see notes below):
//
//   1. lock: (_name, _timeout, fn) => fn()
//      Disable the LockManager. Both apps share the same Supabase storage
//      key and would contend for the same lock; the second-loaded app hangs
//      forever on getSession(). NUForce is read-only on the session, so the
//      lock provides no benefit here. (Confirmed working: navigator.locks
//      probe shows held:[] pending:[] during the failure, so the lock is NOT
//      the source of the save hang.)
//
//   2. autoRefreshToken: false
//      NUWorkspace owns session lifecycle. NUForce reads the session that
//      workspace maintains. Disabling auto-refresh prevents both apps from
//      racing for the single-use refresh_token.
//
//   3. global fetch wrapper — redirect on 401 from Supabase
//      With autoRefresh off, an expired token causes a 401 instead of a
//      silent refresh. We intercept 401s from the Supabase host and bounce
//      the user to workspace login (workspace refreshes and bounces back).
//
// ---------------------------------------------------------------------------
// PHASE 7.1 FIX — the silent-save-hang bug
//
// Root cause: the previous authAwareFetch returned the 401 response to the
// caller after calling window.location.replace(). The assumption baked into
// the old comment — "the redirect will navigate away before the caller sees
// the error" — is false. window.location.replace() SCHEDULES navigation; it
// does not happen synchronously. Execution continues, supabase-js receives a
// 401 on a .single() call, and the caller's promise neither resolves nor
// rejects cleanly. If the navigation is delayed at all (backgrounded tab,
// slow new-page load), the user sits on a hung save in a still-alive page.
//
// Worse: redirectingForAuth was set true and never reset, so after the first
// 401 every later expired-token call got NO bounce (early return) and just
// hung on the caller side. This matches the observed pattern — works after
// fresh sign-in, hangs after the session ages, refresh temporarily fixes it.
//
// Two changes, neither of which touches the Phase 7 contract (autoRefresh
// stays off, the lock no-op stays, workspace stays the sole refresher):
//
//   A. On a 401 we now REJECT the caller's promise (throw) after triggering
//      the bounce, instead of returning the 401 onward. The await chain
//      settles immediately as a clean error the existing toast/catch paths
//      handle; the scheduled navigation still proceeds.
//
//   B. An AbortController timeout wraps every Supabase fetch. Any request
//      that never returns — for ANY reason, not just 401 — aborts after
//      FETCH_TIMEOUT_MS and rejects, so no call can suspend forever. This is
//      the structural backstop; it lets the per-handler Promise.race
//      band-aids in NUForce be removed if desired.
// ---------------------------------------------------------------------------

let redirectingForAuth = false;     // prevent multiple concurrent redirects

function bounceToWorkspaceForReauth() {
  if (redirectingForAuth) return;
  redirectingForAuth = true;
  const ret = encodeURIComponent(window.location.origin);
  window.location.replace(`${WORKSPACE_URL}/?return_to=${ret}`);
}

// Sentinel error types so callers (and logs) can tell these apart from
// ordinary network/query errors if they ever want to.
class AuthBounceError extends Error {
  constructor() {
    super("AUTH_BOUNCE: session expired, redirecting to workspace for re-auth");
    this.name = "AuthBounceError";
    this.isAuthBounce = true;
  }
}
class FetchTimeoutError extends Error {
  constructor(ms) {
    super(`FETCH_TIMEOUT: Supabase request exceeded ${ms}ms`);
    this.name = "FetchTimeoutError";
    this.isFetchTimeout = true;
  }
}

// Wrap the fetch passed to createClient so ONLY Supabase-bound traffic gets
// this behavior (we don't replace window.fetch globally).
function authAwareFetch(input, init) {
  const controller = new AbortController();

  // If the caller already passed a signal, respect it: abort ours if theirs
  // fires, so we don't swallow caller-initiated aborts.
  if (init && init.signal) {
    if (init.signal.aborted) controller.abort();
    else init.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  return fetch(input, { ...init, signal: controller.signal })
    .then(response => {
      clearTimeout(timeoutId);

      if (response.status === 401) {
        // Token expired or invalid. Trigger the bounce AND reject the
        // caller's chain so it settles now instead of choking on a 401
        // body or waiting on a navigation that hasn't happened yet.
        bounceToWorkspaceForReauth();
        throw new AuthBounceError();
      }

      // All other statuses (including non-401 errors) fall through normally.
      return response;
    })
    .catch(err => {
      clearTimeout(timeoutId);

      // Distinguish our abort-timeout from other aborts/errors.
      if (err && err.name === "AbortError") {
        // If we aborted because the caller's own signal fired, propagate that.
        if (init && init.signal && init.signal.aborted) throw err;
        // Otherwise it was our timeout.
        throw new FetchTimeoutError(FETCH_TIMEOUT_MS);
      }

      // AuthBounceError, network errors, etc. propagate to the caller, whose
      // existing catch/toast handling reports them. No silent hang possible.
      throw err;
    });
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: nulabsSessionStorage,
    autoRefreshToken: false,
    persistSession: true,
    detectSessionInUrl: true,
    lock: (_name, _timeout, fn) => fn(),
  },
  global: {
    fetch: authAwareFetch,
  },
});

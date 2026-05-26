import { createClient } from "@supabase/supabase-js";
import { nulabsSessionStorage } from "./nulabsSessionStorage";

const SUPABASE_URL = "https://swuuxzmgmldvvomsgmjf.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_bmrPY65INpUkea8VUX1Wag_T7Vrz9ZZ";
const WORKSPACE_URL = "https://workspace.nulabs.com";

// How long a single Supabase fetch may run before we abort it. Any request
// that hasn't returned by this point is treated as hung and rejected so the
// caller's await chain settles instead of suspending forever.
const FETCH_TIMEOUT_MS = 15000;

// Ceiling for acquiring the in-memory session lock. supabase-js passes -1
// (infinite) by default; we refuse infinite so a stuck operation can't wedge
// the lock queue forever (the root cause of the upstream deadlock bug).
const LOCK_TIMEOUT_MS = 10000;

// Phase 7 fixes for SSO with NUWorkspace (UNCHANGED — see notes below):
//
//   1. lock: in-memory serializing lock (see Phase 7.2 below)
//      Originally a no-op: lock: (_name, _timeout, fn) => fn(). That disabled
//      the LockManager to stop cross-tab navigator.locks contention between
//      NUForce and Workspace (both share the storage key). But the no-op
//      provides NO serialization, and supabase-js's session/token machinery
//      depends on the lock for mutex semantics. See Phase 7.2.
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

// ---------------------------------------------------------------------------
// PHASE 7.2 FIX — the persistent save-hang (replaces the lock no-op)
//
// Root cause (confirmed against supabase-js issues #1594, #2013, #2111):
// the library's session/token operations are serialized through the `lock`
// function. The Phase 7 no-op ran them with NO serialization. Under that,
// concurrent session/token operations on a long-lived session can leave the
// library's internal state wedged on a promise that never settles — the call
// hangs UPSTREAM of fetch(), which is why:
//   - getSession(), .select().single(), and .update() all hang
//   - the AbortController fetch timeout never fires (fetch is never reached)
//   - a direct console fetch to the REST endpoint returns instantly mid-hang
//   - a hard refresh always recovers (fresh in-memory state)
//
// The upstream bug (#1594) is specifically that the library acquires the lock
// with an INFINITE timeout, so an orphaned/stuck operation deadlocks every
// later call. The maintainers' recommended workaround (#2013) is an in-memory
// lock. We implement that — WITH a timeout the library itself lacks — so:
//   - operations are properly serialized (mutex semantics restored), AND
//   - a stuck operation times out and releases the queue instead of wedging
//     it forever.
//
// This is per-client and in-memory, so it does NOT reintroduce the cross-tab
// navigator.locks contention Phase 7 removed. Each tab/app has its own client
// and its own lock chain. autoRefreshToken stays false; workspace stays the
// sole refresher. Phase 7 contract intact.
// ---------------------------------------------------------------------------

class LockAcquireTimeoutError extends Error {
  constructor(name, ms) {
    super(`LOCK_TIMEOUT: lock '${name}' not acquired within ${ms}ms`);
    this.name = "LockAcquireTimeoutError";
    this.isAcquireTimeout = true;   // supabase-js inspects this flag
  }
}

// Single-client, in-memory serializing lock. Serializes operations through a
// promise chain; each operation is bounded by a timeout so a hung op releases
// the chain rather than deadlocking all subsequent ops.
const inMemoryLock = (() => {
  let chain = Promise.resolve();
  return function lock(name, acquireTimeout, fn) {
    const timeoutMs =
      (typeof acquireTimeout === "number" && acquireTimeout > 0)
        ? acquireTimeout
        : LOCK_TIMEOUT_MS;

    const run = chain.then(async () => {
      let timer;
      try {
        return await Promise.race([
          Promise.resolve().then(fn),
          new Promise((_, reject) => {
            timer = setTimeout(
              () => reject(new LockAcquireTimeoutError(name, timeoutMs)),
              timeoutMs
            );
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    });

    // Advance the chain on settle (success OR failure OR timeout) so the next
    // queued operation always proceeds. The chain awaits the same bounded
    // `run`, so even a hung fn frees the chain after timeoutMs.
    chain = run.then(() => {}, () => {});
    return run;
  };
})();

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: nulabsSessionStorage,
    autoRefreshToken: false,
    persistSession: true,
    detectSessionInUrl: true,
    lock: inMemoryLock,
  },
  global: {
    fetch: authAwareFetch,
  },
});
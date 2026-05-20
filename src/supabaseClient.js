import { createClient } from "@supabase/supabase-js";
import { nulabsSessionStorage } from "./nulabsSessionStorage";

const SUPABASE_URL = "https://swuuxzmgmldvvomsgmjf.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_bmrPY65INpUkea8VUX1Wag_T7Vrz9ZZ";
const WORKSPACE_URL = "https://workspace.nulabs.com";

// Phase 7 fixes for SSO with NUWorkspace:
//
//   1. lock: (_name, _timeout, fn) => fn()
//      Disable the LockManager. With both apps using the same Supabase
//      storage key, they contend for the same lock and the second-loaded
//      app hangs forever on getSession(). NUForce is read-only on the
//      session (see #2), so the lock provides no benefit here.
//
//   2. autoRefreshToken: false
//      NUWorkspace owns session lifecycle. NUForce reads the session
//      workspace maintains. Disabling auto-refresh prevents both apps
//      from racing for the single-use refresh_token.
//
//   3. global fetch wrapper — redirect on 401 from Supabase
//      With autoRefresh off, an expired token causes a 401 instead of a
//      silent refresh. We intercept JUST 401s from the Supabase host and
//      bounce the user to workspace login (where workspace will refresh
//      and bounce them back). Strictly keyed off status === 401; all
//      other errors fall through to the caller normally.

let redirectingForAuth = false;     // prevent multiple concurrent redirects

function bounceToWorkspaceForReauth() {
  if (redirectingForAuth) return;
  redirectingForAuth = true;
  const ret = encodeURIComponent(window.location.origin);
  window.location.replace(`${WORKSPACE_URL}/?return_to=${ret}`);
}

// Wrap global fetch so any 401 from the Supabase host triggers a bounce.
// We don't replace window.fetch globally — we pass a custom fetch to
// createClient so only Supabase-bound traffic gets this behavior.
function authAwareFetch(input, init) {
  return fetch(input, init).then(response => {
    if (response.status === 401) {
      // Token expired or invalid. Bounce to workspace for re-auth.
      // Note: response is still returned so caller's await chain doesn't hang;
      // the redirect will navigate away before the caller sees the error.
      bounceToWorkspaceForReauth();
    }
    return response;
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

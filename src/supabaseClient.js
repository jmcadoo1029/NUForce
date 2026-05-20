import { createClient } from "@supabase/supabase-js";
import { nulabsSessionStorage } from "./nulabsSessionStorage";

const SUPABASE_URL = "https://swuuxzmgmldvvomsgmjf.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_bmrPY65INpUkea8VUX1Wag_T7Vrz9ZZ";

// Phase 7 fix: when both NUWorkspace and NUForce are open in the same browser,
// they share the same Supabase storage key and contend for the same navigator
// LockManager lock. This causes getSession() to hang forever on whichever app
// loaded second. Two changes here together resolve it:
//
//   1. lock: (_name, _timeout, fn) => fn()
//      Skip the LockManager entirely. The lock signature is (name, timeout, fn);
//      passing a fn that just invokes the work-callback runs the work without
//      acquiring any lock. We never have multiple concurrent reads/writes
//      within a single tab, and we don't write the session at all (see #2),
//      so the lock provides no benefit and only causes hangs when paired
//      with NUWorkspace.
//
//   2. autoRefreshToken: false
//      NUForce is the gateway-secondary: NUWorkspace owns session lifecycle
//      (login, refresh, logout). NUForce just reads the session workspace
//      maintains. If both apps try to auto-refresh, they race for the
//      single-use refresh_token and one fails. Setting this to false makes
//      NUForce a strictly read-only consumer of the session.
//
// If a user is on NUForce with an expired token and workspace isn't open to
// refresh it, Root.jsx's onAuthStateChange listener catches SIGNED_OUT and
// bounces back to workspace, where login (and refresh) happen normally.

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: nulabsSessionStorage,
    autoRefreshToken: false,
    persistSession: true,
    detectSessionInUrl: true,
    lock: (_name, _timeout, fn) => fn(),
  },
});

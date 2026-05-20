import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import { nulabsSessionStorage } from "./nulabsSessionStorage";
import { checkNuForceAccess } from "./capabilityCheck";
import App from "./App";

// Phase 7: NUForce is now strongly gated by NUWorkspace.
//
// Render outcomes:
//   1. Initial async checks running → null (intentionally no spinner; check is
//      fast and a flash-of-loading-state is worse UX than a brief blank).
//   2. No session → window.location.replace = workspace.nulabs.com/?return_to=...
//      NUWorkspace handles login then bounces back. Render null in the
//      meantime so nothing flashes before the redirect.
//   3. Session + access_nuforce capability → <App />
//   4. Session but no capability → <AccessDenied />
//
// Login.jsx is no longer imported — there is no manual login at NUForce.

const WORKSPACE_URL = "https://workspace.nulabs.com";

function AccessDenied() {
  return (
    <div style={{
      minHeight:"100vh", background:"#0f1419", color:"#fff",
      display:"flex", alignItems:"center", justifyContent:"center", padding:20,
      fontFamily:"system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    }}>
      <div style={{
        maxWidth:480, width:"100%", textAlign:"center",
        background:"#1a2332", borderRadius:14, padding:"48px 36px",
        boxShadow:"0 10px 40px rgba(0,0,0,0.4)",
      }}>
        <div style={{
          fontSize:32, fontWeight:800, letterSpacing:2, color:"#c0392b",
          marginBottom:8,
        }}>
          NUFORCE
        </div>
        <div style={{
          fontSize:11, color:"#9aa5b1", letterSpacing:1.5, marginBottom:32,
        }}>
          NU LABORATORIES · INTERNAL USE ONLY
        </div>
        <div style={{fontSize:18, fontWeight:600, marginBottom:12, color:"#fff"}}>
          Access not granted
        </div>
        <div style={{
          fontSize:13, color:"#bbb", marginBottom:32, lineHeight:1.6,
        }}>
          You don't have access to NUForce. Contact Russ if you believe this is an error.
        </div>
        <a href={WORKSPACE_URL}
          style={{
            display:"inline-block",
            padding:"12px 24px",
            background:"transparent",
            border:"1px solid rgba(255,255,255,0.25)",
            borderRadius:8,
            color:"#fff",
            textDecoration:"none",
            fontSize:13,
            fontWeight:600,
          }}>
          ← Back to NUWorkspace
        </a>
      </div>
    </div>
  );
}

export default function Root() {
  // Possible auth states:
  //   "loading"      — initial check in flight
  //   "no_session"   — redirecting to NUWorkspace (also null-rendered)
  //   "granted"      — session + access_nuforce → render <App />
  //   "denied"       — session but no capability → render <AccessDenied />
  const [authState, setAuthState] = useState("loading");
  const [session, setSession] = useState(null);

  useEffect(() => {
    // One-time cleanup: legacy sessionStorage key from the pre-Supabase-Auth
    // era. Safe to remove — has no meaning after Phase 5.
    try { sessionStorage.removeItem("vibrato_user"); } catch (_) { /* ignore */ }

    let isMounted = true;

    // Run the initial check: read shared session, then capability-gate it.
    (async () => {
      try {
        const { data: { session: s } } = await supabase.auth.getSession();
        if (!isMounted) return;

        if (!s) {
          // No session → bounce to NUWorkspace login with return_to param.
          // window.location.replace() doesn't add a history entry, so the user
          // can't accidentally hit Back into a no-session state.
          const ret = encodeURIComponent(window.location.origin);
          window.location.replace(`${WORKSPACE_URL}/?return_to=${ret}`);
          setAuthState("no_session"); // cosmetic; we're about to navigate away
          return;
        }

        // Session present — run capability check.
        setSession(s);
        const granted = await checkNuForceAccess(supabase, s);
        if (!isMounted) return;
        setAuthState(granted ? "granted" : "denied");
      } catch (err) {
        // Any unhandled error in the auth chain — fail closed and surface
        // the Access Denied page rather than leaving the app stuck in
        // "loading" forever (blank screen). Log to console for debugging.
        console.error("[Root] Initial auth check failed:", err);
        if (!isMounted) return;
        setAuthState("denied");
      }
    })();

    // Subscribe to sign-in / sign-out / token-refresh events.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, s) => {
        if (!isMounted) return;
        if (event === "SIGNED_OUT" || !s) {
          // Sign-out elsewhere (e.g. user logged out of NUWorkspace) →
          // bounce back to NUWorkspace login.
          const ret = encodeURIComponent(window.location.origin);
          window.location.replace(`${WORKSPACE_URL}/?return_to=${ret}`);
          setSession(null);
          setAuthState("no_session");
          return;
        }
        // SIGNED_IN / TOKEN_REFRESHED / USER_UPDATED — re-validate capability.
        setSession(s);
        const granted = await checkNuForceAccess(supabase, s);
        if (!isMounted) return;
        setAuthState(granted ? "granted" : "denied");
      }
    );

    // Belt-and-suspenders: periodic check that the LIVE cookie's token
    // hasn't expired. Critical detail (per Russ): always re-read the cookie,
    // never compare against the in-memory session — workspace may have
    // already refreshed the token in the cookie while NUForce held a stale
    // copy. If the cookie ITSELF shows expiry, bounce to workspace.
    const POLL_MS = 60 * 1000;
    const expiryPoll = setInterval(() => {
      try {
        const raw = nulabsSessionStorage.getItem(
          "sb-swuuxzmgmldvvomsgmjf-auth-token"
        );
        if (!raw) {
          // Cookie gone (e.g. workspace logged out) → bounce.
          const ret = encodeURIComponent(window.location.origin);
          window.location.replace(`${WORKSPACE_URL}/?return_to=${ret}`);
          return;
        }
        const parsed = JSON.parse(raw);
        const nowSec = Math.floor(Date.now() / 1000);
        // Small grace window (30s) — if the token is about to expire we
        // still treat it as valid for this tick rather than racing the
        // 401 fetch wrapper.
        if (parsed?.expires_at && parsed.expires_at < nowSec - 30) {
          // Live cookie's token is genuinely expired (workspace didn't
          // refresh it) → bounce.
          const ret = encodeURIComponent(window.location.origin);
          window.location.replace(`${WORKSPACE_URL}/?return_to=${ret}`);
        }
      } catch (_) {
        /* parsing or cookie read failed — let the 401 wrapper catch issues */
      }
    }, POLL_MS);

    return () => {
      isMounted = false;
      subscription.unsubscribe();
      clearInterval(expiryPoll);
    };
  }, []);

  const handleLogout = async () => {
    // Sign out globally — the onAuthStateChange listener handles the redirect.
    await supabase.auth.signOut();
  };

  if (authState === "loading" || authState === "no_session") return null;
  if (authState === "denied") return <AccessDenied />;

  // App.jsx still receives currentUser as the email string, matching the
  // hardcoded approver comparisons inside it.
  return <App onLogout={handleLogout} currentUser={session.user.email} />;
}

import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import Login from "./Login";
import App from "./App";

export default function Root() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // One-time cleanup: legacy sessionStorage key from the pre-Supabase-Auth
    // era. Safe to remove — it has no meaning after Phase 5.
    try { sessionStorage.removeItem("vibrato_user"); } catch (_) { /* ignore */ }

    // Initial session — reads from the shared .nulabs.com cookie in prod,
    // localStorage in local dev (via the adapter).
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    // Subscribe to sign-in / sign-out / token-refresh events
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => setSession(session)
    );

    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    // session state updates via onAuthStateChange — no need to setSession here
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    // session state updates via onAuthStateChange
  };

  if (loading) return null;

  if (!session) return <Login onLogin={handleLogin} />;

  // App.jsx receives the email exactly like before, so approver gating
  // (currentUser === "jordanmcadoo@nulabs.com" etc.) keeps working as-is.
  return <App onLogout={handleLogout} currentUser={session.user.email} />;
}

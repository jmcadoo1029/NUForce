// src/capabilityCheck.js
//
// Phase 7: capability gate for NUForce.
//
// NUForce is now a gated app: only users granted the `access_nuforce`
// capability in NUWorkspace can use it. This function performs that check
// against the shared Supabase database.
//
// Implementation: two-query approach. A single embedded join would work too
// if a foreign-key constraint is declared between employees.role_id and
// permission_roles.id, but the two-query version works regardless and is
// the safe default.
//
// Failure policy: every error path returns false. Better to deny access
// to a real user (recoverable — Russ can grant) than to accidentally
// grant access to someone who shouldn't have it.

export async function checkNuForceAccess(supabase, session) {
  if (!session?.user?.email) return false;

  // 1) Find the employee row by email (case-insensitive — NUWorkspace's
  //    own lookups are case-insensitive, see auth.js in NUWorkspace).
  const { data: emp, error: e1 } = await supabase
    .from('employees')
    .select('id, role_id')
    .ilike('email', session.user.email)
    .maybeSingle();

  if (e1 || !emp || !emp.role_id) return false; // no row or no role → no access

  // 2) Fetch that role's capabilities JSONB.
  const { data: role, error: e2 } = await supabase
    .from('permission_roles')
    .select('capabilities')
    .eq('id', emp.role_id)
    .maybeSingle();

  if (e2 || !role) return false;

  // Default-deny on missing key — !!(...) coerces undefined → false.
  return !!(role.capabilities?.access_nuforce);
}

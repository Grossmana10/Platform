import { env } from "cloudflare:workers";
export type SiteUser = { userId: string; email: string; displayName: string };
export function db() { if (!env.DB) throw new Error("Database is unavailable"); return env.DB; }
export async function requireProjectMember(projectId: string, userId: string) {
  const member = await db().prepare("SELECT role FROM project_members WHERE project_id = ? AND user_id = ?").bind(projectId, userId).first<{ role: string }>();
  if (!member) throw new Response("You do not have access to this project", { status: 403 });
  return member;
}
export async function upsertProfile(user: SiteUser) {
  await db().prepare(`INSERT INTO profiles (user_id, email, display_name, created_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET email = excluded.email, display_name = excluded.display_name`)
    .bind(user.userId, user.email.toLowerCase(), user.displayName, new Date().toISOString()).run();
}
export function routeError(error: unknown) {
  if (error instanceof Response) return error;
  console.error(error);
  const message = error instanceof Error && error.message.includes("unavailable") ? error.message : "Something went wrong. Please try again.";
  return Response.json({ error: message }, { status: 500 });
}

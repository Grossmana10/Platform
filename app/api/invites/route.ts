import { getChatGPTUser } from "../../chatgpt-auth";
import { db, requireProjectMember, routeError } from "../../../lib/platform-db";

export async function POST(request: Request) {
  try {
    const auth = await getChatGPTUser(); if (!auth) return Response.json({ error: "Sign in required" }, { status: 401 });
    const payload = await request.json() as { projectId?: string; email?: string; role?: string };
    const projectId = payload.projectId ?? "", email = payload.email?.trim().toLowerCase() ?? "", role = ["contributor", "reviewer"].includes(payload.role ?? "") ? payload.role! : "reviewer";
    if (!projectId || !/^\S+@\S+\.\S+$/.test(email)) return Response.json({ error: "Enter a valid email address" }, { status: 400 });
    const member = await requireProjectMember(projectId, auth.userId);
    if (member.role !== "owner") return Response.json({ error: "Only the project owner can invite people" }, { status: 403 });
    const known = await db().prepare("SELECT user_id as userId FROM profiles WHERE lower(email) = ?").bind(email).first<{ userId: string }>();
    if (known) {
      await db().prepare("INSERT OR REPLACE INTO project_members (project_id, user_id, role, created_at) VALUES (?, ?, ?, ?)").bind(projectId, known.userId, role, new Date().toISOString()).run();
    } else {
      await db().prepare("INSERT OR REPLACE INTO project_invites (id, project_id, email, role, invited_by, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), projectId, email, role, auth.userId, new Date().toISOString()).run();
    }
    return Response.json({ ok: true }, { status: 201 });
  } catch (error) { return routeError(error); }
}

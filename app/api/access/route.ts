import { getChatGPTUser } from "../../chatgpt-auth";
import { db, requireProjectMember, routeError } from "../../../lib/platform-db";

export async function PATCH(request: Request) {
  try {
    const auth = await getChatGPTUser();
    if (!auth) return Response.json({ error: "Sign in required" }, { status: 401 });
    const payload = await request.json() as { projectId?: string; userId?: string; inviteId?: string; role?: string };
    const projectId = payload.projectId ?? "";
    const role = payload.role ?? "";
    if (!projectId || !["reviewer", "contributor"].includes(role) || (!payload.userId && !payload.inviteId)) {
      return Response.json({ error: "Choose a valid person and access level" }, { status: 400 });
    }
    const actor = await requireProjectMember(projectId, auth.userId);
    if (actor.role !== "owner") return Response.json({ error: "Only the project owner can change access" }, { status: 403 });
    const database = db();
    if (payload.userId) {
      const target = await database.prepare("SELECT role FROM project_members WHERE project_id = ? AND user_id = ?").bind(projectId, payload.userId).first<{ role: string }>();
      if (!target) return Response.json({ error: "Project member not found" }, { status: 404 });
      if (target.role === "owner") return Response.json({ error: "Owner access cannot be changed" }, { status: 400 });
      await database.prepare("UPDATE project_members SET role = ? WHERE project_id = ? AND user_id = ?").bind(role, projectId, payload.userId).run();
    } else {
      const invite = await database.prepare("SELECT id FROM project_invites WHERE id = ? AND project_id = ?").bind(payload.inviteId, projectId).first();
      if (!invite) return Response.json({ error: "Invitation not found" }, { status: 404 });
      await database.prepare("UPDATE project_invites SET role = ? WHERE id = ? AND project_id = ?").bind(role, payload.inviteId, projectId).run();
    }
    return Response.json({ ok: true });
  } catch (error) { return routeError(error); }
}

import { getChatGPTUser } from "../../chatgpt-auth";
import { db, requireProjectMember, routeError } from "../../../lib/platform-db";

export async function POST(request: Request) {
  try {
    const auth = await getChatGPTUser();
    if (!auth) return Response.json({ error: "Sign in required" }, { status: 401 });
    const payload = await request.json() as { projectId?: string };
    const projectId = payload.projectId ?? "";
    if (!projectId) return Response.json({ error: "Project is required" }, { status: 400 });
    const member = await requireProjectMember(projectId, auth.userId);
    if (member.role !== "owner") return Response.json({ error: "Only the project owner can create review links" }, { status: 403 });
    const database = db();
    const existing = await database.prepare("SELECT token FROM project_share_links WHERE project_id = ? AND role = 'reviewer' ORDER BY created_at DESC LIMIT 1").bind(projectId).first<{ token: string }>();
    const token = existing?.token ?? crypto.randomUUID();
    if (!existing) {
      await database.prepare("INSERT INTO project_share_links (id, project_id, token, role, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(crypto.randomUUID(), projectId, token, "reviewer", auth.userId, new Date().toISOString()).run();
    }
    return Response.json({ token });
  } catch (error) { return routeError(error); }
}

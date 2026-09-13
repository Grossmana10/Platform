import { getChatGPTUser } from "../../chatgpt-auth";
import { db, requireProjectMember, routeError } from "../../../lib/platform-db";

export async function POST(request: Request) {
  try {
    const auth = await getChatGPTUser(); if (!auth) return Response.json({ error: "Sign in required" }, { status: 401 });
    const payload = await request.json() as { projectId?: string; parentId?: string | null; name?: string };
    const projectId = payload.projectId ?? "", name = payload.name?.trim();
    if (!projectId || !name) return Response.json({ error: "Folder name is required" }, { status: 400 });
    const member = await requireProjectMember(projectId, auth.userId);
    if (member.role === "reviewer") return Response.json({ error: "Reviewers cannot create folders" }, { status: 403 });
    let parent: { id: string; name: string } | null = null;
    if (payload.parentId) {
      parent = await db().prepare("SELECT id, name FROM folders WHERE id = ? AND project_id = ?").bind(payload.parentId, projectId).first<{ id: string; name: string }>();
      if (!parent) return Response.json({ error: "Parent folder not found" }, { status: 404 });
      if (parent.name === "Artwork") return Response.json({ error: "Artwork holds one project image and cannot contain folders" }, { status: 400 });
    }
    const database = db(), id = crypto.randomUUID(), now = new Date().toISOString();
    const statements = [database.prepare("INSERT INTO folders (id, project_id, parent_id, name, position, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(id, projectId, payload.parentId ?? null, name, Date.now(), auth.userId, now)];
    const createsSong = !payload.parentId || parent?.name === "Songs";
    if (createsSong) {
      for (const [position, childName] of ["Mixes", "Masters", "References", "Stems"].entries()) {
        statements.push(database.prepare("INSERT INTO folders (id, project_id, parent_id, name, position, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
          .bind(crypto.randomUUID(), projectId, id, childName, position, auth.userId, now));
      }
    }
    await database.batch(statements);
    return Response.json({ id, songStructureCreated: createsSong }, { status: 201 });
  } catch (error) { return routeError(error); }
}

export async function PATCH(request: Request) {
  try {
    const auth = await getChatGPTUser(); if (!auth) return Response.json({ error: "Sign in required" }, { status: 401 });
    const payload = await request.json() as { folderId?: string; name?: string };
    const folderId = payload.folderId ?? "", name = payload.name?.trim();
    if (!folderId || !name) return Response.json({ error: "Folder name is required" }, { status: 400 });
    const folder = await db().prepare("SELECT project_id AS projectId, parent_id AS parentId, name FROM folders WHERE id = ?").bind(folderId).first<{ projectId: string; parentId: string | null; name: string }>();
    if (!folder) return Response.json({ error: "Folder not found" }, { status: 404 });
    const member = await requireProjectMember(folder.projectId, auth.userId);
    if (member.role === "reviewer") return Response.json({ error: "Reviewers cannot rename folders" }, { status: 403 });
    if (!folder.parentId && ["Songs", "Artwork", "Album References", "Deliverables"].includes(folder.name)) return Response.json({ error: "Built-in project folders cannot be renamed" }, { status: 400 });
    await db().prepare("UPDATE folders SET name = ? WHERE id = ? AND project_id = ?").bind(name, folderId, folder.projectId).run();
    return Response.json({ ok: true });
  } catch (error) { return routeError(error); }
}

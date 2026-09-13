import { getChatGPTUser } from "../../chatgpt-auth";
import { db, requireProjectMember, routeError, upsertProfile } from "../../../lib/platform-db";

export async function POST(request: Request) {
  try {
    const auth = await getChatGPTUser(); if (!auth) return Response.json({ error: "Sign in required" }, { status: 401 });
    const payload = await request.json() as { name?: string; artist?: string };
    const name = payload.name?.trim(), artist = payload.artist?.trim();
    if (!name || !artist) return Response.json({ error: "Project and artist names are required" }, { status: 400 });
    await upsertProfile({ userId: auth.userId, email: auth.email, displayName: auth.displayName });
    const database = db(), id = crypto.randomUUID(), now = new Date().toISOString();
    const statements = [
      database.prepare("INSERT INTO projects (id, name, artist, created_by, created_at) VALUES (?, ?, ?, ?, ?)").bind(id, name, artist, auth.userId, now),
      database.prepare("INSERT INTO project_members (project_id, user_id, role, created_at) VALUES (?, ?, ?, ?)").bind(id, auth.userId, "owner", now),
    ];
    for (const [position, folderName] of ["Songs", "Artwork", "Album References", "Deliverables"].entries()) {
      statements.push(database.prepare("INSERT INTO folders (id, project_id, parent_id, name, position, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(crypto.randomUUID(), id, null, folderName, position, auth.userId, now));
    }
    await database.batch(statements);
    return Response.json({ id }, { status: 201 });
  } catch (error) { return routeError(error); }
}

export async function PATCH(request: Request) {
  try {
    const auth = await getChatGPTUser(); if (!auth) return Response.json({ error: "Sign in required" }, { status: 401 });
    const payload = await request.json() as { projectId?: string; name?: string; artist?: string; renameArtist?: boolean };
    const projectId = payload.projectId ?? "", name = payload.name?.trim(), artist = payload.artist?.trim();
    if (!projectId || (!name && !artist)) return Response.json({ error: "A new name is required" }, { status: 400 });
    if (payload.name !== undefined && !name) return Response.json({ error: "Project name cannot be empty" }, { status: 400 });
    if (payload.artist !== undefined && !artist) return Response.json({ error: "Artist name cannot be empty" }, { status: 400 });
    const member = await requireProjectMember(projectId, auth.userId);
    if (member.role !== "owner") return Response.json({ error: "Only the project owner can rename it" }, { status: 403 });
    const database = db();
    const project = await database.prepare("SELECT artist, created_by AS createdBy FROM projects WHERE id = ?").bind(projectId).first<{ artist: string; createdBy: string }>();
    if (!project) return Response.json({ error: "Project not found" }, { status: 404 });
    const statements = [];
    if (name) statements.push(database.prepare("UPDATE projects SET name = ? WHERE id = ?").bind(name, projectId));
    if (artist && payload.renameArtist) statements.push(database.prepare("UPDATE projects SET artist = ? WHERE artist = ? AND created_by = ?").bind(artist, project.artist, project.createdBy));
    else if (artist) statements.push(database.prepare("UPDATE projects SET artist = ? WHERE id = ?").bind(artist, projectId));
    await database.batch(statements);
    return Response.json({ ok: true });
  } catch (error) { return routeError(error); }
}

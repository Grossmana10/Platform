import { getChatGPTUser } from "../../chatgpt-auth";
import { db, routeError, upsertProfile } from "../../../lib/platform-db";

export const dynamic = "force-dynamic";

const seedFolders = [
  ["01 — Still Water", null], ["02 — Heatwave", null], ["03 — Silver Lines", null], ["04 — New Shape", null],
  ["Album References", null], ["Artwork", null], ["Deliverables", null],
] as const;

async function createStarterProject(userId: string) {
  const database = db(), now = new Date().toISOString(), projectId = crypto.randomUUID();
  const statements = [
    database.prepare("INSERT INTO projects (id, name, artist, created_by, created_at) VALUES (?, ?, ?, ?, ?)").bind(projectId, "The Night Bloom", "Maya Lane", userId, now),
    database.prepare("INSERT INTO project_members (project_id, user_id, role, created_at) VALUES (?, ?, ?, ?)").bind(projectId, userId, "owner", now),
  ];
  for (let i = 0; i < seedFolders.length; i++) {
    const id = crypto.randomUUID();
    statements.push(database.prepare("INSERT INTO folders (id, project_id, parent_id, name, position, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(id, projectId, null, seedFolders[i][0], i, userId, now));
    if (i < 4) {
      for (const [j, name] of ["Mixes", "Masters", "References", "Stems"].entries()) {
        statements.push(database.prepare("INSERT INTO folders (id, project_id, parent_id, name, position, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), projectId, id, name, j, userId, now));
      }
    }
  }
  await database.batch(statements);
  return projectId;
}

type ProjectRow = { id: string; name: string; artist: string; role: string };

async function ensureStaticFolders(projectId: string, userId: string) {
  const database = db();
  const existing = await database.prepare("SELECT name FROM folders WHERE project_id = ? AND parent_id IS NULL").bind(projectId).all<{ name: string }>();
  const names = new Set(existing.results.map((folder) => folder.name));
  const missing = ["Artwork", "Album References", "Deliverables"].filter((name) => !names.has(name));
  if (!missing.length) return;
  const now = new Date().toISOString();
  await database.batch(missing.map((name, index) => database.prepare("INSERT INTO folders (id, project_id, parent_id, name, position, created_by, created_at) VALUES (?, ?, NULL, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), projectId, name, 100 + index, userId, now)));
}

async function workspacePayload(project: ProjectRow, projects: ProjectRow[], publicView = false) {
  const database = db();
  const [folders, assets, versions, comments, members] = await Promise.all([
    database.prepare("SELECT id, parent_id as parentId, name, position FROM folders WHERE project_id = ? ORDER BY position, name").bind(project.id).all(),
    database.prepare("SELECT id, folder_id as folderId, title, status, created_at as createdAt FROM assets WHERE project_id = ? ORDER BY created_at DESC").bind(project.id).all(),
    database.prepare(`SELECT v.id, v.asset_id as assetId, v.version_no as versionNo, v.file_name as fileName, v.size_bytes as sizeBytes,
      v.content_type as contentType, v.duration_seconds as durationSeconds, v.created_at as createdAt
      FROM asset_versions v JOIN assets a ON a.id = v.asset_id WHERE a.project_id = ? ORDER BY v.version_no DESC`).bind(project.id).all(),
    database.prepare(`SELECT c.id, c.version_id as versionId, c.time_ms as timeMs, c.body, c.created_at as createdAt,
      COALESCE(p.display_name, 'Collaborator') as author FROM comments c
      JOIN asset_versions v ON v.id = c.version_id JOIN assets a ON a.id = v.asset_id
      LEFT JOIN profiles p ON p.user_id = c.author_id WHERE a.project_id = ? ORDER BY c.time_ms`).bind(project.id).all(),
    publicView
      ? Promise.resolve({ results: [] })
      : database.prepare(`SELECT pm.user_id as userId, p.display_name as name, p.email, pm.role FROM project_members pm JOIN profiles p ON p.user_id = pm.user_id WHERE pm.project_id = ?`).bind(project.id).all(),
  ]);
  const invites = publicView ? [] : (await database.prepare("SELECT id, email, role FROM project_invites WHERE project_id = ? ORDER BY created_at DESC").bind(project.id).all()).results;
  return { projects, project, folders: folders.results, assets: assets.results, versions: versions.results, comments: comments.results, members: members.results, invites };
}

export async function GET(request: Request) {
  try {
    const auth = await getChatGPTUser();
    const database = db(), shareToken = new URL(request.url).searchParams.get("share");
    if (!auth) {
      if (!shareToken) return Response.json({ error: "Sign in required" }, { status: 401 });
      const shared = await database.prepare(`SELECT p.id, p.name, p.artist FROM project_share_links s
        JOIN projects p ON p.id = s.project_id WHERE s.token = ?`).bind(shareToken).first<{ id: string; name: string; artist: string }>();
      if (!shared) return Response.json({ error: "This review link is not valid" }, { status: 404 });
      const project: ProjectRow = { ...shared, role: "viewer" };
      return Response.json({ user: { name: "Guest", email: "" }, ...await workspacePayload(project, [project], true) });
    }
    const user = { userId: auth.userId, email: auth.email, displayName: auth.displayName };
    await upsertProfile(user);

    let joinedProjectId: string | null = null;
    if (shareToken) {
      const share = await database.prepare("SELECT project_id as projectId, role FROM project_share_links WHERE token = ?").bind(shareToken).first<{ projectId: string; role: string }>();
      if (share) {
        await database.prepare("INSERT OR IGNORE INTO project_members (project_id, user_id, role, created_at) VALUES (?, ?, ?, ?)").bind(share.projectId, user.userId, share.role, new Date().toISOString()).run();
        joinedProjectId = share.projectId;
      }
    }

    const invitations = await database.prepare("SELECT id, project_id, role FROM project_invites WHERE lower(email) = ?").bind(user.email.toLowerCase()).all<{ id: string; project_id: string; role: string }>();
    if (invitations.results.length) {
      joinedProjectId ??= invitations.results[0].project_id;
      const statements = invitations.results.flatMap((invite) => [
        database.prepare("INSERT OR IGNORE INTO project_members (project_id, user_id, role, created_at) VALUES (?, ?, ?, ?)").bind(invite.project_id, user.userId, invite.role, new Date().toISOString()),
        database.prepare("DELETE FROM project_invites WHERE id = ?").bind(invite.id),
      ]);
      await database.batch(statements);
    }

    let projects = await database.prepare(`SELECT p.id, p.name, p.artist, pm.role FROM projects p
      JOIN project_members pm ON pm.project_id = p.id WHERE pm.user_id = ? ORDER BY p.created_at`).bind(user.userId).all<{ id: string; name: string; artist: string; role: string }>();
    if (!projects.results.length) {
      await createStarterProject(user.userId);
      projects = await database.prepare(`SELECT p.id, p.name, p.artist, pm.role FROM projects p
        JOIN project_members pm ON pm.project_id = p.id WHERE pm.user_id = ? ORDER BY p.created_at`).bind(user.userId).all();
    }

    const requested = new URL(request.url).searchParams.get("projectId") ?? joinedProjectId;
    const project = (projects.results as ProjectRow[]).find((p) => p.id === requested) ?? projects.results[0] as ProjectRow;
    await ensureStaticFolders(project.id, user.userId);
    return Response.json({ user: { name: user.displayName, email: user.email }, ...await workspacePayload(project, projects.results as ProjectRow[]) });
  } catch (error) { return routeError(error); }
}

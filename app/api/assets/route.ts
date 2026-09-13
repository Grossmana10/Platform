import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../chatgpt-auth";
import { db, requireProjectMember, routeError } from "../../../lib/platform-db";

export async function PATCH(request: Request) {
  try {
    const auth = await getChatGPTUser(); if (!auth) return Response.json({ error: "Sign in required" }, { status: 401 });
    const payload = await request.json() as { assetId?: string; title?: string; folderId?: string };
    const assetId = payload.assetId ?? "", title = payload.title?.trim(), folderId = payload.folderId?.trim();
    if (!assetId || (!title && !folderId)) return Response.json({ error: "A new name or folder is required" }, { status: 400 });
    if (payload.title !== undefined && !title) return Response.json({ error: "Track name cannot be empty" }, { status: 400 });
    const database = db();
    const asset = await database.prepare("SELECT project_id AS projectId FROM assets WHERE id = ?").bind(assetId).first<{ projectId: string }>();
    if (!asset) return Response.json({ error: "Audio file not found" }, { status: 404 });
    const member = await requireProjectMember(asset.projectId, auth.userId);
    if (member.role === "reviewer") return Response.json({ error: "Reviewers cannot organize files" }, { status: 403 });
    if (folderId) {
      const folder = await database.prepare("SELECT id, parent_id AS parentId, name FROM folders WHERE id = ? AND project_id = ?").bind(folderId, asset.projectId).first<{ id: string; parentId: string | null; name: string }>();
      if (!folder) return Response.json({ error: "Destination folder not found" }, { status: 404 });
      if (!folder.parentId && folder.name === "Artwork") return Response.json({ error: "Audio files cannot be moved into Artwork" }, { status: 400 });
    }
    const statements = [];
    if (title) statements.push(database.prepare("UPDATE assets SET title = ? WHERE id = ? AND project_id = ?").bind(title, assetId, asset.projectId));
    if (folderId) statements.push(database.prepare("UPDATE assets SET folder_id = ? WHERE id = ? AND project_id = ?").bind(folderId, assetId, asset.projectId));
    await database.batch(statements);
    return Response.json({ ok: true });
  } catch (error) { return routeError(error); }
}

export async function DELETE(request: Request) {
  try {
    const auth = await getChatGPTUser(); if (!auth) return Response.json({ error: "Sign in required" }, { status: 401 });
    if (!env.BUCKET) throw new Error("Media storage is unavailable");
    const bucket = env.BUCKET;
    const payload = await request.json() as { assetId?: string };
    const assetId = payload.assetId ?? "";
    if (!assetId) return Response.json({ error: "Audio file is required" }, { status: 400 });
    const database = db();
    const asset = await database.prepare("SELECT project_id AS projectId FROM assets WHERE id = ?").bind(assetId).first<{ projectId: string }>();
    if (!asset) return Response.json({ error: "Audio file not found" }, { status: 404 });
    const member = await requireProjectMember(asset.projectId, auth.userId);
    if (member.role === "reviewer") return Response.json({ error: "Reviewers cannot delete files" }, { status: 403 });
    const versions = await database.prepare("SELECT storage_key AS storageKey FROM asset_versions WHERE asset_id = ?").bind(assetId).all<{ storageKey: string }>();
    await database.batch([
      database.prepare("DELETE FROM comments WHERE version_id IN (SELECT id FROM asset_versions WHERE asset_id = ?)").bind(assetId),
      database.prepare("DELETE FROM asset_versions WHERE asset_id = ?").bind(assetId),
      database.prepare("DELETE FROM assets WHERE id = ? AND project_id = ?").bind(assetId, asset.projectId),
    ]);
    const storageResults = await Promise.allSettled(versions.results.map((version) => bucket.delete(version.storageKey)));
    if (storageResults.some((result) => result.status === "rejected")) console.error("Some deleted track objects could not be removed from storage");
    return Response.json({ ok: true });
  } catch (error) { return routeError(error); }
}

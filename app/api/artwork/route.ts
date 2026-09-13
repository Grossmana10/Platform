import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../chatgpt-auth";
import { db, requireProjectMember, routeError } from "../../../lib/platform-db";

const MAX_BYTES = 20 * 1024 * 1024;

export async function POST(request: Request) {
  let storedKey: string | null = null;
  try {
    const auth = await getChatGPTUser(); if (!auth) return Response.json({ error: "Sign in required" }, { status: 401 });
    if (!env.BUCKET) throw new Error("Media storage is unavailable");
    const bucket = env.BUCKET;
    const url = new URL(request.url), projectId = url.searchParams.get("projectId") ?? "", folderId = url.searchParams.get("folderId") ?? "";
    const fileName = (url.searchParams.get("fileName") ?? "project-artwork").slice(0, 180);
    const size = Number(request.headers.get("content-length") ?? 0), contentType = request.headers.get("content-type") ?? "application/octet-stream";
    if (!projectId || !folderId || !request.body) return Response.json({ error: "Missing artwork information" }, { status: 400 });
    if (size > MAX_BYTES) return Response.json({ error: "Artwork can be up to 20 MB" }, { status: 413 });
    if (!/^image\/(jpeg|png|webp)$/i.test(contentType) && !/\.(jpe?g|png|webp)$/i.test(fileName)) return Response.json({ error: "Choose a JPEG, PNG, or WebP image" }, { status: 415 });
    const member = await requireProjectMember(projectId, auth.userId);
    if (member.role === "reviewer") return Response.json({ error: "Reviewers cannot upload artwork" }, { status: 403 });
    const database = db();
    const folder = await database.prepare("SELECT id FROM folders WHERE id = ? AND project_id = ? AND parent_id IS NULL AND name = 'Artwork'").bind(folderId, projectId).first();
    if (!folder) return Response.json({ error: "Artwork folder not found" }, { status: 404 });
    const existing = await database.prepare("SELECT id FROM assets WHERE project_id = ? AND folder_id = ? LIMIT 1").bind(projectId, folderId).first<{ id: string }>();
    const assetId = existing?.id ?? crypto.randomUUID(), versionId = crypto.randomUUID(), now = new Date().toISOString();
    const oldVersions = existing ? await database.prepare("SELECT storage_key AS storageKey FROM asset_versions WHERE asset_id = ?").bind(assetId).all<{ storageKey: string }>() : { results: [] as Array<{ storageKey: string }> };
    storedKey = `${projectId}/artwork/${versionId}/${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    await bucket.put(storedKey, request.body, { httpMetadata: { contentType } });
    const statements = [];
    if (existing) {
      statements.push(database.prepare("DELETE FROM comments WHERE version_id IN (SELECT id FROM asset_versions WHERE asset_id = ?)").bind(assetId));
      statements.push(database.prepare("DELETE FROM asset_versions WHERE asset_id = ?").bind(assetId));
      statements.push(database.prepare("UPDATE assets SET title = ?, status = ? WHERE id = ?").bind("Project Artwork", "Current", assetId));
    } else {
      statements.push(database.prepare("INSERT INTO assets (id, project_id, folder_id, title, status, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(assetId, projectId, folderId, "Project Artwork", "Current", auth.userId, now));
    }
    statements.push(database.prepare("INSERT INTO asset_versions (id, asset_id, version_no, file_name, storage_key, size_bytes, content_type, duration_seconds, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(versionId, assetId, 1, fileName, storedKey, size, contentType, null, auth.userId, now));
    await database.batch(statements);
    const removals = await Promise.allSettled(oldVersions.results.map((version) => bucket.delete(version.storageKey)));
    if (removals.some((result) => result.status === "rejected")) console.error("Previous artwork could not be fully removed from storage");
    return Response.json({ assetId, versionId }, { status: 201 });
  } catch (error) {
    if (storedKey && env.BUCKET) await env.BUCKET.delete(storedKey).catch(() => undefined);
    return routeError(error);
  }
}

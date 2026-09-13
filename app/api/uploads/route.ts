import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../chatgpt-auth";
import { db, requireProjectMember, routeError } from "../../../lib/platform-db";

const MAX_BYTES = 500 * 1024 * 1024;

export async function POST(request: Request) {
  let storedKey: string | null = null;
  try {
    const auth = await getChatGPTUser(); if (!auth) return Response.json({ error: "Sign in required" }, { status: 401 });
    if (!env.BUCKET) throw new Error("Media storage is unavailable");
    const url = new URL(request.url), projectId = url.searchParams.get("projectId") ?? "", folderId = url.searchParams.get("folderId") ?? "";
    const fileName = (url.searchParams.get("fileName") ?? "audio-file").slice(0, 180), title = (url.searchParams.get("title") ?? fileName.replace(/\.[^.]+$/, "")).trim().slice(0, 120);
    const requestedAssetId = url.searchParams.get("assetId"), duration = Math.max(0, Math.round(Number(url.searchParams.get("duration") ?? 0)));
    const size = Number(request.headers.get("content-length") ?? 0), contentType = request.headers.get("content-type") ?? "application/octet-stream";
    if (!projectId || !folderId || !title || !request.body) return Response.json({ error: "Missing upload information" }, { status: 400 });
    if (size > MAX_BYTES) return Response.json({ error: "This test version accepts files up to 500 MB" }, { status: 413 });
    if (!contentType.startsWith("audio/") && !/\.(wav|wave|aif|aiff|flac|mp3|m4a|aac)$/i.test(fileName)) return Response.json({ error: "Choose a WAV, AIFF, FLAC, MP3, AAC, or M4A audio file" }, { status: 415 });
    const member = await requireProjectMember(projectId, auth.userId);
    if (member.role === "reviewer") return Response.json({ error: "Reviewers cannot upload files" }, { status: 403 });
    const database = db();
    const folder = await database.prepare("SELECT id, parent_id AS parentId, name FROM folders WHERE id = ? AND project_id = ?").bind(folderId, projectId).first<{ id: string; parentId: string | null; name: string }>();
    if (!folder) return Response.json({ error: "Folder not found" }, { status: 404 });
    if (!folder.parentId && folder.name === "Artwork") return Response.json({ error: "Upload an image in the Artwork folder" }, { status: 400 });

    let assetId = requestedAssetId;
    if (assetId) {
      const asset = await database.prepare("SELECT id FROM assets WHERE id = ? AND project_id = ?").bind(assetId, projectId).first();
      if (!asset) return Response.json({ error: "Track not found" }, { status: 404 });
    } else {
      const existing = await database.prepare("SELECT id FROM assets WHERE folder_id = ? AND lower(title) = lower(?)").bind(folderId, title).first<{ id: string }>();
      assetId = existing?.id ?? crypto.randomUUID();
    }
    const last = await database.prepare("SELECT MAX(version_no) as versionNo FROM asset_versions WHERE asset_id = ?").bind(assetId).first<{ versionNo: number | null }>();
    const versionNo = (last?.versionNo ?? 0) + 1, versionId = crypto.randomUUID();
    storedKey = `${projectId}/${assetId}/${versionId}/${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    await env.BUCKET.put(storedKey, request.body, { httpMetadata: { contentType } });
    const statements = [];
    if (!requestedAssetId && !last?.versionNo) statements.push(database.prepare("INSERT INTO assets (id, project_id, folder_id, title, status, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(assetId, projectId, folderId, title, "In review", auth.userId, new Date().toISOString()));
    statements.push(database.prepare("INSERT INTO asset_versions (id, asset_id, version_no, file_name, storage_key, size_bytes, content_type, duration_seconds, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(versionId, assetId, versionNo, fileName, storedKey, size, contentType, duration || null, auth.userId, new Date().toISOString()));
    await database.batch(statements);
    return Response.json({ assetId, versionId, versionNo }, { status: 201 });
  } catch (error) {
    if (storedKey && env.BUCKET) await env.BUCKET.delete(storedKey).catch(() => undefined);
    return routeError(error);
  }
}

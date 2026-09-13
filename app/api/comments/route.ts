import { getChatGPTUser } from "../../chatgpt-auth";
import { db, requireProjectMember, routeError } from "../../../lib/platform-db";

export async function POST(request: Request) {
  try {
    const auth = await getChatGPTUser(); if (!auth) return Response.json({ error: "Sign in required" }, { status: 401 });
    const payload = await request.json() as { versionId?: string; timeMs?: number; body?: string };
    const body = payload.body?.trim() ?? "", timeMs = Math.max(0, Math.round(Number(payload.timeMs ?? 0)));
    if (!payload.versionId || !body) return Response.json({ error: "Write a comment first" }, { status: 400 });
    const version = await db().prepare(`SELECT a.project_id as projectId FROM asset_versions v JOIN assets a ON a.id = v.asset_id WHERE v.id = ?`).bind(payload.versionId).first<{ projectId: string }>();
    if (!version) return Response.json({ error: "Version not found" }, { status: 404 });
    await requireProjectMember(version.projectId, auth.userId);
    const id = crypto.randomUUID();
    await db().prepare("INSERT INTO comments (id, version_id, time_ms, body, author_id, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(id, payload.versionId, timeMs, body.slice(0, 2000), auth.userId, new Date().toISOString()).run();
    return Response.json({ id }, { status: 201 });
  } catch (error) { return routeError(error); }
}

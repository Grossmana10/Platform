import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { db, requireProjectMember, routeError } from "../../../../lib/platform-db";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getChatGPTUser();
    if (!env.BUCKET) throw new Error("Media storage is unavailable");
    const { id } = await context.params;
    const record = await db().prepare(`SELECT v.storage_key as storageKey, v.file_name as fileName, v.content_type as contentType, a.project_id as projectId
      FROM asset_versions v JOIN assets a ON a.id = v.asset_id WHERE v.id = ?`).bind(id).first<{ storageKey: string; fileName: string; contentType: string; projectId: string }>();
    if (!record) return new Response("File not found", { status: 404 });
    if (auth) await requireProjectMember(record.projectId, auth.userId);
    else {
      const shareToken = new URL(request.url).searchParams.get("share");
      const share = shareToken ? await db().prepare("SELECT id FROM project_share_links WHERE token = ? AND project_id = ?").bind(shareToken, record.projectId).first() : null;
      if (!share) return new Response("This review link is not valid", { status: 403 });
    }
    const wantsRange = request.headers.has("range");
    const object = await env.BUCKET.get(record.storageKey, wantsRange ? { range: request.headers } : undefined);
    if (!object) return new Response("File not found", { status: 404 });
    const headers = new Headers({ "Content-Type": record.contentType, "Content-Length": String(object.size), "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=3600", "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(record.fileName)}` });
    object.writeHttpMetadata(headers);
    if (wantsRange && object.range) {
      const range = object.range;
      const length = "suffix" in range ? Math.min(range.suffix, object.size) : "length" in range && range.length !== undefined ? range.length : object.size - (range.offset ?? 0);
      const offset = "suffix" in range ? object.size - length : range.offset ?? 0;
      headers.set("Content-Length", String(length));
      headers.set("Content-Range", `bytes ${offset}-${offset + length - 1}/${object.size}`);
      return new Response(object.body, { status: 206, headers });
    }
    return new Response(object.body, { headers });
  } catch (error) { return routeError(error); }
}

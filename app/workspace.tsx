"use client";

import { memo, type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Download, ExternalLink, FileAudio, FileOutput, Folder, FolderInput, FolderPlus, Image as ImageIcon, Link2, Menu, Moon, Music2, Pause, Pencil, Play, Plus, Sun, Trash2, Upload, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

type Project = { id: string; name: string; artist: string; role: string };
type FolderRow = { id: string; parentId: string | null; name: string; position: number };
type Asset = { id: string; folderId: string; title: string; status: string; createdAt: string };
type Version = { id: string; assetId: string; versionNo: number; fileName: string; sizeBytes: number; contentType: string; durationSeconds: number | null; createdAt: string };
type Comment = { id: string; versionId: string; timeMs: number; body: string; author: string; createdAt: string };
type WorkspaceData = { projects: Project[]; project: Project; folders: FolderRow[]; assets: Asset[]; versions: Version[]; comments: Comment[]; members: Array<{ userId: string; name: string; email: string; role: string }>; invites: Array<{ id: string; email: string; role: string }> };
type RenameTarget = { kind: "artist" | "project" | "folder" | "asset"; id: string; value: string };

const fmtTime = (seconds: number) => {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  return `${Math.floor(safe / 60)}:${String(Math.floor(safe % 60)).padStart(2, "0")}`;
};
const fmtSize = (bytes: number) => bytes >= 1024 ** 2 ? `${(bytes / 1024 ** 2).toFixed(bytes >= 100 * 1024 ** 2 ? 0 : 1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
const folderLabel = (folder: FolderRow, folders: FolderRow[]) => {
  const byId = new Map(folders.map((item) => [item.id, item]));
  const names = [folder.name]; let parentId = folder.parentId;
  while (parentId) { const parent = byId.get(parentId); if (!parent) break; names.unshift(parent.name); parentId = parent.parentId; }
  return names.join(" / ");
};

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init), data = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(data.error ?? "Request failed");
  return data as T;
}

export default function Workspace({ user, initialShareToken, publicView = false }: { user: { name: string; email: string }; initialShareToken: string | null; publicView?: boolean }) {
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [assetId, setAssetId] = useState<string | null>(null);
  const [versionId, setVersionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dark, setDark] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [toolView, setToolView] = useState<"markers" | null>(null);
  const [folderOpen, setFolderOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [artworkOpen, setArtworkOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [projectOpen, setProjectOpen] = useState(false);
  const [projectMode, setProjectMode] = useState<"project" | "artist">("project");
  const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null);
  const [moveAsset, setMoveAsset] = useState<Asset | null>(null);
  const [deleteAsset, setDeleteAsset] = useState<Asset | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [comment, setComment] = useState("");
  const [uploadAsset, setUploadAsset] = useState<Asset | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const commentRef = useRef<HTMLTextAreaElement>(null);
  const shareTokenRef = useRef(initialShareToken);

  const load = useCallback(async (nextProjectId?: string | null) => {
    try {
      setLoading(true);
      const query = new URLSearchParams();
      if (nextProjectId) query.set("projectId", nextProjectId);
      else if (shareTokenRef.current) query.set("share", shareTokenRef.current);
      const result = await jsonRequest<WorkspaceData>(`/api/workspace${query.size ? `?${query}` : ""}`, { cache: "no-store" });
      if (shareTokenRef.current && !publicView) { shareTokenRef.current = null; window.history.replaceState({}, "", "/"); toast.success(`Opened ${result.project.name}`); }
      setData(result); setProjectId(result.project.id); setToolView(null);
      const silver = result.folders.find((f) => f.name === "03 — Silver Lines");
      const mixes = result.folders.find((f) => f.parentId === silver?.id && f.name === "Mixes");
      setFolderId((current) => current && result.folders.some((f) => f.id === current) ? current : mixes?.id ?? result.folders[0]?.id ?? null);
      setExpanded(new Set([...(silver ? [silver.id] : []), ...(mixes ? [mixes.id] : [])]));
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not load the project"); }
    finally { setLoading(false); }
  }, [publicView]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setDark(window.localStorage.getItem("platform-theme") === "dark"); }, []);

  const currentFolder = data?.folders.find((f) => f.id === folderId) ?? null;
  const currentAsset = data?.assets.find((a) => a.id === assetId) ?? null;
  const assetVersions = useMemo(() => data?.versions.filter((v) => v.assetId === assetId).sort((a, b) => b.versionNo - a.versionNo) ?? [], [data, assetId]);
  const currentVersion = assetVersions.find((v) => v.id === versionId) ?? assetVersions[0] ?? null;
  const versionComments = data?.comments.filter((c) => c.versionId === currentVersion?.id) ?? [];
  const effectiveDuration = Number.isFinite(duration) && duration > 0 ? duration : currentVersion?.durationSeconds ?? 0;
  const playheadPercent = effectiveDuration ? Math.max(0, Math.min(100, (time / effectiveDuration) * 100)) : 0;
  const canEdit = data?.project.role === "owner" || data?.project.role === "contributor";
  const canComment = data?.project.role !== "viewer";
  const isOwner = data?.project.role === "owner";
  const mediaShareQuery = publicView && initialShareToken ? `?share=${encodeURIComponent(initialShareToken)}` : "";
  const tutorialHref = initialShareToken ? `/tutorial?share=${encodeURIComponent(initialShareToken)}` : "/tutorial";
  const artworkFolder = data?.folders.find((folder) => !folder.parentId && folder.name === "Artwork") ?? null;
  const artworkAsset = data?.assets.find((asset) => asset.folderId === artworkFolder?.id) ?? null;
  const artworkVersion = data?.versions.filter((version) => version.assetId === artworkAsset?.id && version.contentType.startsWith("image/")).sort((a, b) => b.versionNo - a.versionNo)[0] ?? null;
  const isArtworkFolder = currentFolder?.id === artworkFolder?.id;

  useEffect(() => {
    if (currentAsset && !currentVersion && assetVersions[0]) setVersionId(assetVersions[0].id);
  }, [currentAsset, currentVersion, assetVersions]);
  useEffect(() => { setTime(0); setDuration(0); setPlaying(false); }, [currentVersion?.id]);
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const followPlayhead = () => { if (audioRef.current) setTime(audioRef.current.currentTime); frame = requestAnimationFrame(followPlayhead); };
    frame = requestAnimationFrame(followPlayhead);
    return () => cancelAnimationFrame(frame);
  }, [playing, currentVersion?.id]);

  const selectAsset = (asset: Asset) => {
    const latest = data?.versions.filter((v) => v.assetId === asset.id).sort((a, b) => b.versionNo - a.versionNo)[0];
    setAssetId(asset.id); setVersionId(latest?.id ?? null); setToolView(null); setNavOpen(false);
  };

  const folderTrail = useMemo(() => {
    if (!data || !currentFolder) return [];
    const byId = new Map(data.folders.map((f) => [f.id, f]));
    const trail: FolderRow[] = []; let cursor: FolderRow | undefined = currentFolder;
    while (cursor) { trail.unshift(cursor); cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined; }
    return trail;
  }, [data, currentFolder]);

  const renderTree = (parentId: string | null, depth = 0): React.ReactNode => data?.folders.filter((f) => f.parentId === parentId).map((folder) => {
    const children = data.folders.some((f) => f.parentId === folder.id), isExpanded = expanded.has(folder.id);
    return <div key={folder.id}>
      <div className={`tree-row ${folderId === folder.id && !assetId ? "active" : ""}`} style={{ paddingLeft: 8 + depth * 14 }}>
        <button className="tree-toggle" aria-label={`${isExpanded ? "Collapse" : "Expand"} ${folder.name}`} onClick={() => setExpanded((old) => { const next = new Set(old); isExpanded ? next.delete(folder.id) : next.add(folder.id); return next; })}>{children ? isExpanded ? <ChevronDown /> : <ChevronRight /> : <span />}</button>
        <button className="tree-name" onClick={() => { setFolderId(folder.id); setAssetId(null); setVersionId(null); setToolView(null); setNavOpen(false); }}><Folder /> <span>{folder.name}</span></button>
      </div>
      {children && isExpanded && renderTree(folder.id, depth + 1)}
    </div>;
  });

  const addComment = async () => {
    if (!currentVersion || !comment.trim()) return;
    try {
      await jsonRequest("/api/comments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ versionId: currentVersion.id, timeMs: Math.round(time * 1000), body: comment }) });
      setComment(""); await load(projectId); toast.success("Comment added");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not add comment"); }
  };
  const toggleTheme = () => setDark((current) => { const next = !current; window.localStorage.setItem("platform-theme", next ? "dark" : "light"); return next; });

  if (loading && !data) return <main className="loading-screen"><div className="brand">platform<BrandMark /></div><p>Opening your workspace…</p></main>;
  if (!data) return <main className="loading-screen"><p>The workspace could not be opened.</p><Button onClick={() => load()}>Try again</Button></main>;

  return <div className={`workspace ${dark ? "dark" : ""}`}>
    {artworkVersion && <div className="artwork-backdrop" style={{ backgroundImage: `url(/api/media/${artworkVersion.id}${mediaShareQuery})` }} aria-hidden="true" />}
    <Toaster richColors position="bottom-right" />
    <header className="topbar">
      <button className="mobile-menu" onClick={() => setNavOpen(!navOpen)} aria-label="Open project files"><Menu /></button>
      <a className="brand" href="/">platform<BrandMark /></a>
      <nav className="media-nav" aria-label="Media spaces"><a className="active" href="/">Audio</a><span title="Video testing comes next">Video</span><a href={tutorialHref}>Tutorial</a></nav>
      <div className="top-actions">
        <div className="breadcrumbs"><button onClick={() => { setAssetId(null); setFolderId(null); setToolView(null); }}>{data.project.name}</button>{toolView ? <span>/ DAW Marker Exports</span> : <>{folderTrail.map((f) => <span key={f.id}>/ <button onClick={() => { setFolderId(f.id); setAssetId(null); setToolView(null); }}>{f.name}</button></span>)}{currentAsset && <span>/ {currentAsset.title}</span>}</>}</div>
        <button className="icon-control" onClick={toggleTheme} aria-label={dark ? "Use light mode" : "Use dark mode"}>{dark ? <Sun /> : <Moon />}</button>
        {isOwner && <Button variant="outline" onClick={() => setInviteOpen(true)}><UserPlus /> <span className="button-label">Share</span></Button>}
        {canEdit && !toolView && <Button onClick={() => { if (isArtworkFolder) setArtworkOpen(true); else { setUploadAsset(currentAsset); setUploadOpen(true); } }}>{isArtworkFolder ? <ImageIcon /> : <Upload />} <span className="button-label">{isArtworkFolder ? "Artwork" : "Upload"}</span></Button>}
        <div className="account" title={user.email}>{user.name.slice(0, 1).toUpperCase()}</div>
      </div>
    </header>

    <div className="app-grid">
      <aside className={`sidebar ${navOpen ? "open" : ""}`}>
        <div className="project-switcher">
          <div className="artist-context"><div className="artist-heading"><span>Artist</span><div className="artist-actions">{isOwner && <button className="edit-name-button" onClick={() => setRenameTarget({ kind: "artist", id: data.project.id, value: data.project.artist })} aria-label="Rename artist"><Pencil /></button>}{!publicView && <button className="add-artist-button" onClick={() => { setProjectMode("artist"); setProjectOpen(true); }}><Plus /> New artist</button>}</div></div><strong>{data.project.artist}</strong></div>
          <label className="project-select"><span>Project</span><select value={data.project.id} onChange={(e) => { setAssetId(null); setFolderId(null); load(e.target.value); }} aria-label="Current project">
            {[...new Set(data.projects.map((project) => project.artist))].map((artist) => <optgroup label={artist} key={artist}>{data.projects.filter((project) => project.artist === artist).map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</optgroup>)}
          </select></label>
          {!publicView && <div className="project-actions">{isOwner && <button className="edit-project-button" onClick={() => setRenameTarget({ kind: "project", id: data.project.id, value: data.project.name })} aria-label="Rename project"><Pencil /></button>}<button className="new-project-button" onClick={() => { setProjectMode("project"); setProjectOpen(true); }} aria-label="Create project"><Plus /></button></div>}
          <small className="project-role">{data.project.role}</small>
        </div>
        <div className="side-heading"><span>Project files</span>{canEdit && !isArtworkFolder && <button onClick={() => setFolderOpen(true)} aria-label="Create folder"><FolderPlus /></button>}</div>
        <div className="folder-tree">{renderTree(null)}</div>
        <button className={`sidebar-tool ${toolView === "markers" ? "active" : ""}`} onClick={() => { setToolView("markers"); setAssetId(null); setFolderId(null); setNavOpen(false); }}><FileOutput /><span><strong>DAW Marker Exports</strong><small>Turn notes into marker files</small></span></button>
        <div className="collab-block"><div className="side-heading"><span>People</span><span>{data.members.length + data.invites.length}</span></div>
          {data.members.map((m) => <PersonAccess key={m.userId} projectId={data.project.id} person={m} isOwner={isOwner} after={() => load(projectId)} />)}
          {data.invites.map((m) => <PersonAccess key={m.id} projectId={data.project.id} invite={m} isOwner={isOwner} after={() => load(projectId)} />)}
        </div>
      </aside>

      <main className="main-panel">
        {toolView === "markers" ? <MarkerExportView data={data} /> : currentAsset && currentVersion ? <>
          <div className="asset-header"><div><p className="eyebrow">{currentFolder?.name ?? "Audio"}</p><h1>{currentAsset.title}</h1><p>{currentVersion.fileName} · {fmtSize(currentVersion.sizeBytes)}</p></div><div className="header-actions">{canEdit && <Button variant="outline" onClick={() => setRenameTarget({ kind: "asset", id: currentAsset.id, value: currentAsset.title })}><Pencil /> Rename</Button>}{canEdit && <Button variant="outline" onClick={() => setMoveAsset(currentAsset)}><FolderInput /> Move</Button>}{canEdit && <Button variant="destructive" onClick={() => setDeleteAsset(currentAsset)}><Trash2 /> Delete</Button>}<a className="download-link" href={`/api/media/${currentVersion.id}${mediaShareQuery}`} download={currentVersion.fileName}><Download /> Download original</a></div></div>
          <div className="version-tabs" role="tablist" aria-label="Audio versions">{assetVersions.map((v, index) => <button role="tab" aria-selected={v.id === currentVersion.id} className={v.id === currentVersion.id ? "active" : ""} key={v.id} onClick={() => setVersionId(v.id)}>V{v.versionNo}{index === 0 && <small>Current</small>}</button>)}{canEdit && <button className="add-version" onClick={() => { setUploadAsset(currentAsset); setUploadOpen(true); }}><Plus /> New version</button>}</div>
          <section className="player-card">
            <audio ref={audioRef} src={`/api/media/${currentVersion.id}${mediaShareQuery}`} preload="metadata" onLoadedMetadata={(e) => { if (Number.isFinite(e.currentTarget.duration) && e.currentTarget.duration > 0) setDuration(e.currentTarget.duration); }} onDurationChange={(e) => { if (Number.isFinite(e.currentTarget.duration) && e.currentTarget.duration > 0) setDuration(e.currentTarget.duration); }} onCanPlay={(e) => { if (Number.isFinite(e.currentTarget.duration) && e.currentTarget.duration > 0) setDuration(e.currentTarget.duration); }} onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)} onSeeking={(e) => setTime(e.currentTarget.currentTime)} onSeeked={(e) => setTime(e.currentTarget.currentTime)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); setTime(effectiveDuration); }} />
            <div className="waveform" role="slider" tabIndex={0} aria-label="Audio timeline" aria-valuemin={0} aria-valuemax={Math.round(effectiveDuration)} aria-valuenow={Math.round(time)} onClick={(e) => { const a = audioRef.current; if (!a || !effectiveDuration) return; const rect = e.currentTarget.getBoundingClientRect(); const nextTime = Math.max(0, Math.min(effectiveDuration, ((e.clientX - rect.left) / rect.width) * effectiveDuration)); a.currentTime = nextTime; setTime(nextTime); }}>
              {canComment && <button className="playhead-note-button" style={{ left: `${Math.max(7, Math.min(93, playheadPercent))}%` }} onClick={(e) => { e.stopPropagation(); commentRef.current?.focus(); }} aria-label={`Add a note at ${fmtTime(time)}`}><Plus /> Add note</button>}
              <div className="playhead-line" style={{ left: `${playheadPercent}%` }} />
              <div className="wave-bars">{Array.from({ length: 116 }, (_, i) => <i key={i} style={{ height: `${12 + ((i * 37 + i * i * 7) % 76)}%` }} />)}</div>
              <div className="wave-bars wave-bars-played" style={{ clipPath: `inset(0 ${100 - playheadPercent}% 0 0)` }}>{Array.from({ length: 116 }, (_, i) => <i key={i} style={{ height: `${12 + ((i * 37 + i * i * 7) % 76)}%` }} />)}</div>
              {versionComments.map((c) => <button key={c.id} className="timeline-marker" style={{ left: `${effectiveDuration ? Math.max(0, Math.min(100, (c.timeMs / 1000 / effectiveDuration) * 100)) : 0}%` }} onClick={(e) => { e.stopPropagation(); const markerTime = Math.min(c.timeMs / 1000, effectiveDuration || c.timeMs / 1000); if (audioRef.current) audioRef.current.currentTime = markerTime; setTime(markerTime); commentRef.current?.focus(); }} aria-label={`Go to comment at ${fmtTime(c.timeMs / 1000)}`} />)}
            </div>
            <div className="transport"><span>{fmtTime(time)}</span><button className="play-button" onClick={() => { const a = audioRef.current; if (!a) return; playing ? a.pause() : a.play().catch(() => toast.error("This file could not be played in your browser")); }} aria-label={playing ? "Pause" : "Play"}>{playing ? <Pause /> : <Play />}</button><span>{fmtTime(effectiveDuration)}</span></div>
          </section>
          <p className="player-hint">Click the waveform to move the playhead. Comments stay attached to this version.</p>
          {canComment ? <div className="inline-comment-composer"><label htmlFor="comment">Add a note at <strong>{fmtTime(time)}</strong></label><Textarea ref={commentRef} id="comment" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="What are you hearing at this moment?" onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") addComment(); }} /><Button onClick={addComment} disabled={!comment.trim()}>Add note at {fmtTime(time)}</Button></div> : <p className="public-view-notice">View-only link · sign in to collaborate or leave notes.</p>}
        </> : <FolderView data={data} folder={currentFolder} mediaShareQuery={mediaShareQuery} onFolder={(id) => { setFolderId(id); setAssetId(null); setToolView(null); setExpanded((old) => new Set(old).add(id)); }} onAsset={selectAsset} onUpload={() => { setUploadAsset(null); setUploadOpen(true); }} onUploadArtwork={() => setArtworkOpen(true)} onNewFolder={() => setFolderOpen(true)} onRename={() => currentFolder && setRenameTarget({ kind: "folder", id: currentFolder.id, value: currentFolder.name })} canEdit={canEdit} />}
      </main>

      <aside className="comments-panel">
        {toolView === "markers" ? <ToolInfo title="DAW Marker Exports" copy="Choose a scope and DAW format, preview every timeline note, then download a marker file for your session." /> : currentAsset && currentVersion ? <><div className="comments-heading"><div><p className="eyebrow">Version V{currentVersion.versionNo}</p><h2>Timeline notes</h2></div><strong>{versionComments.length}</strong></div>
          <div className="comments-list">{versionComments.length ? versionComments.map((c) => <button className="comment-card" key={c.id} onClick={() => { const noteTime = c.timeMs / 1000; if (audioRef.current) audioRef.current.currentTime = noteTime; setTime(noteTime); }}><div><i>{c.author.slice(0, 1).toUpperCase()}</i><strong>{c.author}</strong><time>{fmtTime(c.timeMs / 1000)}</time></div><p>{c.body}</p></button>) : <div className="empty-comments"><span>00:00</span><p>No notes on this version yet.</p></div>}</div></> : <ProjectInfo data={data} />}
      </aside>
    </div>

    <FolderDialog open={folderOpen} setOpen={setFolderOpen} projectId={data.project.id} folders={data.folders} initialParent={folderId} dark={dark} after={() => load(projectId)} />
    <UploadDialog open={uploadOpen} setOpen={setUploadOpen} projectId={data.project.id} folders={data.folders} initialFolder={folderId} asset={uploadAsset} dark={dark} after={async (result) => { await load(projectId); setAssetId(result.assetId); setVersionId(result.versionId); }} />
    <ArtworkDialog open={artworkOpen} setOpen={setArtworkOpen} projectId={data.project.id} folder={artworkFolder} dark={dark} hasArtwork={!!artworkVersion} after={() => load(projectId)} />
    <ShareDialog open={inviteOpen} setOpen={setInviteOpen} projectId={data.project.id} dark={dark} after={() => load(projectId)} />
    <ProjectDialog key={`${projectMode}-${data.project.artist}`} open={projectOpen} setOpen={setProjectOpen} mode={projectMode} currentArtist={data.project.artist} dark={dark} after={load} />
    <RenameDialog target={renameTarget} setTarget={setRenameTarget} projectId={data.project.id} dark={dark} after={() => load(projectId)} />
    <MoveAssetDialog asset={moveAsset} setAsset={setMoveAsset} folders={data.folders} dark={dark} after={async (destinationId) => { await load(projectId); setFolderId(destinationId); setExpanded((old) => new Set(old).add(destinationId)); }} />
    <DeleteAssetDialog asset={deleteAsset} setAsset={setDeleteAsset} dark={dark} after={async () => { setAssetId(null); setVersionId(null); await load(projectId); }} />
  </div>;
}

function FolderView({ data, folder, mediaShareQuery, onFolder, onAsset, onUpload, onUploadArtwork, onNewFolder, onRename, canEdit }: { data: WorkspaceData; folder: FolderRow | null; mediaShareQuery: string; onFolder: (id: string) => void; onAsset: (asset: Asset) => void; onUpload: () => void; onUploadArtwork: () => void; onNewFolder: () => void; onRename: () => void; canEdit: boolean }) {
  const childFolders = data.folders.filter((f) => f.parentId === (folder?.id ?? null));
  const childAssets = data.assets.filter((a) => a.folderId === folder?.id);
  const isArtwork = !folder?.parentId && folder?.name === "Artwork";
  const isAlbumReferences = !folder?.parentId && folder?.name === "Album References";
  const isStaticRoot = !folder?.parentId && !!folder && ["Songs", "Artwork", "Album References", "Deliverables"].includes(folder.name);
  const artworkAsset = isArtwork ? childAssets[0] : null;
  const artworkVersion = data.versions.filter((version) => version.assetId === artworkAsset?.id && version.contentType.startsWith("image/")).sort((a, b) => b.versionNo - a.versionNo)[0];
  if (isArtwork) return <><div className="folder-header"><div><p className="eyebrow">Project artwork</p><h1>Artwork</h1><p>One image · displayed across the project background at 10% opacity</p></div>{canEdit && <div className="header-actions"><Button onClick={onUploadArtwork}><ImageIcon /> {artworkVersion ? "Replace artwork" : "Upload artwork"}</Button></div>}</div>
    <section className="artwork-panel">{artworkVersion ? <><img src={`/api/media/${artworkVersion.id}${mediaShareQuery}`} alt={`${data.project.name} project artwork`} /><div><p className="eyebrow">Current image</p><h2>{artworkVersion.fileName}</h2><p>{fmtSize(artworkVersion.sizeBytes)} · JPEG, PNG, or WebP</p>{canEdit && <Button variant="outline" onClick={onUploadArtwork}><ImageIcon /> Replace image</Button>}</div></> : <div className="artwork-empty"><ImageIcon /><h2>Add project artwork</h2><p>The image will sit softly behind the workspace while you review the project.</p>{canEdit && <Button onClick={onUploadArtwork}>Choose an image</Button>}</div>}</section></>;
  if (isAlbumReferences) return <AlbumReferencesView canEdit={canEdit} onUpload={onUpload} />;
  return <><div className="folder-header"><div><p className="eyebrow">{folder ? "Project folder" : `${data.project.artist} · Album project`}</p><h1>{folder?.name ?? data.project.name}</h1><p>{childFolders.length + childAssets.length} items · newest versions first</p></div>{canEdit && <div className="header-actions">{folder && !isStaticRoot && <Button variant="outline" onClick={onRename}><Pencil /> Rename</Button>}<Button variant="outline" onClick={onNewFolder}><FolderPlus /> {!folder || folder.name === "Songs" ? "New song" : "New folder"}</Button><Button onClick={onUpload}><Upload /> Upload audio</Button></div>}</div>
    <section className="file-list"><div className="file-list-head"><span>Name</span><span>Status</span><span>Modified</span></div>
      {childFolders.map((f) => <button className="file-row" key={f.id} onClick={() => onFolder(f.id)}><i><Folder /></i><span><strong>{f.name}</strong><small>{data.folders.filter((x) => x.parentId === f.id).length + data.assets.filter((x) => x.folderId === f.id).length} items</small></span><em>Folder</em><time>—</time><ChevronRight /></button>)}
      {childAssets.map((a) => { const versions = data.versions.filter((v) => v.assetId === a.id).sort((x, y) => y.versionNo - x.versionNo), latest = versions[0]; return <button className="file-row" key={a.id} onClick={() => onAsset(a)}><i><FileAudio /></i><span><strong>{a.title}</strong><small>{latest?.fileName} · {latest ? fmtSize(latest.sizeBytes) : "No file"}</small></span><em className="review-pill">V{latest?.versionNo ?? 0} · {a.status}</em><time>{latest ? new Date(latest.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—"}</time><ChevronRight /></button>; })}
      {!childFolders.length && !childAssets.length && <div className="folder-empty"><FileAudio /><h2>This folder is ready.</h2><p>Upload a mix, master, reference, or stem to begin reviewing it.</p>{canEdit && <Button onClick={onUpload}>Upload first audio file</Button>}</div>}
    </section></>;
}

function BrandMark() {
  return <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>;
}

function ProjectInfo({ data }: { data: WorkspaceData }) {
  return <><div className="comments-heading"><div><p className="eyebrow">Project</p><h2>{data.project.name}</h2></div></div><div className="project-stats"><div><strong>{data.assets.length}</strong><span>Tracks</span></div><div><strong>{data.versions.length}</strong><span>Versions</span></div><div><strong>{data.comments.length}</strong><span>Notes</span></div></div><p className="side-copy">Original files are kept private and unchanged. Each upload with the same track title becomes a new version.</p></>;
}

function ToolInfo({ title, copy }: { title: string; copy: string }) {
  return <><div className="comments-heading"><div><p className="eyebrow">Project tool</p><h2>{title}</h2></div></div><p className="side-copy">{copy}</p></>;
}

function PersonAccess({ projectId, person, invite, isOwner, after }: { projectId: string; person?: WorkspaceData["members"][number]; invite?: WorkspaceData["invites"][number]; isOwner: boolean; after: () => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const role = person?.role ?? invite?.role ?? "reviewer";
  const changeRole = async (nextRole: string) => {
    try {
      setSaving(true);
      await jsonRequest("/api/access", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId, userId: person?.userId, inviteId: invite?.id, role: nextRole }) });
      await after(); toast.success("Access updated");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not change access"); }
    finally { setSaving(false); }
  };
  const label = person?.name ?? invite?.email ?? "Collaborator";
  return <div className={`person ${invite ? "pending" : ""}`}><i>{invite ? "+" : label.slice(0, 1).toUpperCase()}</i><span><strong>{label}</strong>{invite && <small>Invitation pending</small>}</span>{isOwner && role !== "owner" ? <select className="access-select" value={role} disabled={saving} onChange={(event) => changeRole(event.target.value)} aria-label={`Access for ${label}`}><option value="reviewer">Reviewer</option><option value="contributor">Contributor</option></select> : <small className="access-label">{role}</small>}</div>;
}

const referenceProviders = [
  ["spotify", "Spotify", "Mock connected"], ["apple", "Apple Music", "Mock connected"],
  ["soundcloud", "SoundCloud", "Mock connected"], ["youtube", "YouTube Music", "Mock connected"],
  ["tidal", "TIDAL", "Mock connected"], ["bandcamp", "Bandcamp", "Mock connected"], ["link", "Other link", "Any public music URL"],
] as const;

function AlbumReferencesView({ canEdit, onUpload }: { canEdit: boolean; onUpload: () => void }) {
  const [provider, setProvider] = useState<(typeof referenceProviders)[number][0]>("spotify");
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<{ title: string; provider: string } | null>(null);
  const [linked, setLinked] = useState([{ title: "Glass Gardens — Luma Vale", provider: "Spotify" }]);
  const resolve = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!query.trim()) return;
    const inferred = referenceProviders.find(([id]) => query.toLowerCase().includes(id === "apple" ? "music.apple" : id));
    const nextProvider = inferred?.[0] ?? provider; setProvider(nextProvider);
    setResult({ title: query.startsWith("http") ? "Resolved track — Sample artist" : `${query} — Sample artist`, provider: referenceProviders.find(([id]) => id === nextProvider)?.[1] ?? "Link" });
  };
  return <><div className="folder-header"><div><p className="eyebrow">Album references · Unified API</p><h1>Album References</h1><p>Search or paste a track link, preview its metadata, then attach it to this album.</p></div>{canEdit && <Button variant="outline" onClick={onUpload}><Upload /> Upload audio reference</Button>}</div>
    <section className="connector-panel"><div className="provider-grid">{referenceProviders.map(([id, name, state]) => <button key={id} className={`provider-button ${provider === id ? "selected" : ""}`} onClick={() => setProvider(id)}><span className={`provider-dot ${id}`} /><span><strong>{name}</strong><small>{state}</small></span></button>)}</div>
      <form className="reference-search" onSubmit={resolve}><label htmlFor="reference-query">Track link or search</label><div><Input id="reference-query" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Paste a music URL—or type a song" /><Button type="submit" disabled={!query.trim()}>Resolve reference</Button></div><p>Mock endpoint: <code>POST /v1/references/resolve</code></p></form>
      {result && <article className="resolved-reference"><Music2 /><div><strong>{result.title}</strong><small>{result.provider} · normalized catalog result</small></div><Button disabled={!canEdit} onClick={() => { setLinked((items) => [...items, result]); setResult(null); setQuery(""); toast.success("Reference added to mockup"); }}>Add reference</Button></article>}
    </section>
    <section className="linked-references"><div className="preview-head"><div><h2>Linked album references</h2><p>{linked.length} streaming {linked.length === 1 ? "reference" : "references"}</p></div></div>{linked.map((item, index) => <article className="linked-track" key={`${item.title}-${index}`}><span className="provider-dot spotify" /><div><strong>{item.title}</strong><small>{item.provider} · Added to this album</small></div><button aria-label={`Open ${item.title} at source`} onClick={() => toast.message("This mock reference will open its source in the production connector.")}><ExternalLink /></button></article>)}</section>
    <p className="prototype-note"><strong>Prototype boundary:</strong> this simulates one normalized API across multiple providers. Production connections will follow each service&apos;s authorization, catalog, and playback rules; Platform stores metadata and the source URL, not streaming audio.</p></>;
}

const exportFormats = [
  ["csv", "Universal CSV", "Ready", "Portable spreadsheet / interchange"], ["json", "Structured JSON", "Ready", "Canonical Platform timeline data"],
  ["reaper", "REAPER marker CSV", "Ready", "Marker import-ready CSV"], ["protools", "Pro Tools", "Bridge", "Tab-delimited Memory Locations prep"],
  ["logic", "Logic Pro", "Bridge", "Marker CSV for conversion"], ["ableton", "Ableton Live", "Bridge", "Locator CSV for conversion"],
  ["cubase", "Cubase / Nuendo", "Bridge", "Marker CSV for conversion"],
] as const;

function MarkerExportView({ data }: { data: WorkspaceData }) {
  const [scope, setScope] = useState("mixes"), [format, setFormat] = useState<(typeof exportFormats)[number][0]>("csv");
  const rows = useMemo(() => {
    const assetById = new Map(data.assets.map((asset) => [asset.id, asset]));
    const versionById = new Map(data.versions.map((version) => [version.id, version]));
    const folderById = new Map(data.folders.map((folder) => [folder.id, folder]));
    const latestIds = new Set(data.assets.map((asset) => data.versions.filter((version) => version.assetId === asset.id).sort((a, b) => b.versionNo - a.versionNo)[0]?.id).filter(Boolean));
    const newest = [...data.versions].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.id;
    const isMix = (asset: Asset) => { let folder = folderById.get(asset.folderId); while (folder) { if (folder.name.toLowerCase() === "mixes") return true; folder = folder.parentId ? folderById.get(folder.parentId) : undefined; } return false; };
    return data.comments.flatMap((comment) => {
      const version = versionById.get(comment.versionId); const asset = version ? assetById.get(version.assetId) : undefined;
      if (!version || !asset) return [];
      if (scope === "last" && version.id !== newest) return [];
      if (scope === "mixes" && (!latestIds.has(version.id) || !isMix(asset))) return [];
      if (scope === "all" && !isMix(asset)) return [];
      return [{ assetId: asset.id, song: asset.title, version: `V${version.versionNo}`, seconds: comment.timeMs / 1000, note: comment.body, author: comment.author }];
    }).sort((a, b) => a.song.localeCompare(b.song) || a.seconds - b.seconds);
  }, [data, scope]);
  const selected = exportFormats.find(([id]) => id === format)!;
  const download = () => {
    const quote = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
    let body: string, extension = "csv", type = "text/csv";
    if (format === "json") { body = JSON.stringify(rows.map((row) => ({ song: row.song, version: row.version, start_seconds: row.seconds, note: row.note, author: row.author })), null, 2); extension = "json"; type = "application/json"; }
    else if (format === "protools") { body = ["Name\tStart Time\tComments", ...rows.map((row, index) => `${index + 1} ${row.song} ${row.version}\t${fmtTime(row.seconds)}\t${row.note}`)].join("\n"); extension = "tsv"; type = "text/tab-separated-values"; }
    else if (format === "reaper") body = ["#,Name,Start,End,Length,Color", ...rows.map((row, index) => [index + 1, quote(`${row.song} ${row.version}: ${row.note}`), row.seconds.toFixed(3), "", "", ""].join(","))].join("\n");
    else body = ["song,version,start_seconds,position,note,author", ...rows.map((row) => [quote(row.song), quote(row.version), row.seconds.toFixed(3), quote(fmtTime(row.seconds)), quote(row.note), quote(row.author)].join(","))].join("\n");
    downloadText(`platform-${format}-markers.${extension}`, body, type); toast.success(`${selected[1]} export downloaded`);
  };
  return <><div className="folder-header"><div><p className="eyebrow">Project tool</p><h1>DAW Marker Exports</h1><p>Turn version-specific timeline notes into marker files.</p></div></div>
    <section className="export-builder"><label className="field-label">Export scope<select value={scope} onChange={(event) => setScope(event.target.value)}><option value="last">Last opened version</option><option value="mixes">Current mixes only</option><option value="all">All mix versions</option></select></label><div className="export-grid">{exportFormats.map(([id, name, state, description]) => <button key={id} className={`export-card ${format === id ? "selected" : ""}`} onClick={() => setFormat(id)}><span className="format-icon">{id === "json" ? "{}" : "⇥"}</span><span><strong>{name}</strong><small>{description}</small></span><em className={state === "Ready" ? "ready" : ""}>{state}</em></button>)}</div></section>
    <section className="export-preview"><div className="preview-head"><div><h2>Marker preview</h2><p>{rows.length} markers · {new Set(rows.map((row) => row.assetId)).size} tracks · {selected[1]}</p></div><Button onClick={download} disabled={!rows.length}><Download /> Download export</Button></div><div className="marker-table"><div className="marker-table-head"><span>Song / version</span><span>Position</span><span>Note</span><span>Author</span></div>{rows.length ? rows.slice(0, 20).map((row, index) => <div className="marker-table-row" key={`${row.assetId}-${row.seconds}-${index}`}><span><strong>{row.song}</strong><small>{row.version}</small></span><time>{fmtTime(row.seconds)}</time><p>{row.note}</p><span>{row.author}</span></div>) : <p className="marker-empty">No timeline notes in this scope yet.</p>}</div></section>
    <p className="prototype-note"><strong>Prototype boundary:</strong> CSV, JSON, and REAPER files are generated directly. Pro Tools, Logic, Ableton, and Cubase/Nuendo currently use bridge files; native session integration needs a DAW-specific adapter or companion app.</p></>;
}

function downloadText(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function FolderDialog({ open, setOpen, projectId, folders, initialParent, dark, after }: { open: boolean; setOpen: (v: boolean) => void; projectId: string; folders: FolderRow[]; initialParent: string | null; dark: boolean; after: () => Promise<void> }) {
  const folderChoices = folders.filter((folder) => folder.parentId || folder.name !== "Artwork");
  const [parentId, setParentId] = useState(initialParent ?? ""), [saving, setSaving] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => { if (open) { const allowed = initialParent && folderChoices.some((folder) => folder.id === initialParent); setParentId(allowed ? initialParent : folders.find((folder) => !folder.parentId && folder.name === "Songs")?.id ?? ""); } }, [open, initialParent, folders]);
  const createsSong = !parentId || folders.find((folder) => folder.id === parentId)?.name === "Songs";
  const save = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const name = String(new FormData(event.currentTarget).get("name") ?? "").trim(); if (!name) return; try { setSaving(true); await jsonRequest("/api/folders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId, parentId: parentId || null, name }) }); formRef.current?.reset(); setOpen(false); await after(); toast.success("Folder created"); } catch (e) { toast.error(e instanceof Error ? e.message : "Could not create folder"); } finally { setSaving(false); } };
  return <Dialog open={open} onOpenChange={(next) => { if (!saving) { if (!next) formRef.current?.reset(); setOpen(next); } }}><DialogContent className={`workspace-dialog ${dark ? "workspace-dialog-dark" : ""}`}><form ref={formRef} className="dialog-form" onSubmit={save}><DialogHeader><DialogTitle>New song or folder</DialogTitle><DialogDescription>Songs created inside Songs automatically include Mixes, Masters, References, and Stems.</DialogDescription></DialogHeader><label className="field-label">Name<Input name="name" autoFocus autoComplete="off" /></label><label className="field-label">Location<select value={parentId} onChange={(e) => setParentId(e.target.value)}><option value="">Project root</option>{folderChoices.map((f) => <option key={f.id} value={f.id}>{folderLabel(f, folders)}</option>)}</select></label><DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Creating…" : createsSong ? "Create song" : "Create folder"}</Button></DialogFooter></form></DialogContent></Dialog>;
}

function UploadDialog({ open, setOpen, projectId, folders, initialFolder, asset, dark, after }: { open: boolean; setOpen: (v: boolean) => void; projectId: string; folders: FolderRow[]; initialFolder: string | null; asset: Asset | null; dark: boolean; after: (result: { assetId: string; versionId: string }) => Promise<void> }) {
  const audioFolders = useMemo(() => folders.filter((folder) => folder.parentId || folder.name !== "Artwork"), [folders]);
  const [file, setFile] = useState<File | null>(null), [title, setTitle] = useState(""), [folderId, setFolderId] = useState(initialFolder ?? ""), [progress, setProgress] = useState(0), [uploading, setUploading] = useState(false);
  useEffect(() => { if (open) { setFile(null); setProgress(0); setTitle(asset?.title ?? ""); const requested = asset?.folderId ?? initialFolder; setFolderId(requested && audioFolders.some((folder) => folder.id === requested) ? requested : audioFolders[0]?.id ?? ""); } }, [open, asset, initialFolder, audioFolders]);
  const upload = async () => {
    if (!file || !folderId || !title.trim()) return;
    try {
      setUploading(true); const duration = await readDuration(file);
      const params = new URLSearchParams({ projectId, folderId, title: title.trim(), fileName: file.name, duration: String(duration) }); if (asset) params.set("assetId", asset.id);
      const result = await xhrUpload(`/api/uploads?${params}`, file, setProgress);
      setOpen(false); await after(result); toast.success(asset ? "New version uploaded" : "Audio uploaded");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Upload failed"); } finally { setUploading(false); }
  };
  return <Dialog open={open} onOpenChange={(v) => !uploading && setOpen(v)}><DialogContent className={`workspace-dialog ${dark ? "workspace-dialog-dark" : ""}`}><DialogHeader><DialogTitle>{asset ? `Upload a new ${asset.title} version` : "Upload audio"}</DialogTitle><DialogDescription>The original file is stored unchanged. Maximum size for this test is 500 MB.</DialogDescription></DialogHeader><label className="drop-file"><input type="file" accept="audio/*,.wav,.wave,.aif,.aiff,.flac,.mp3,.m4a,.aac" onChange={(e) => { const next = e.target.files?.[0] ?? null; setFile(next); if (next && !asset) setTitle(next.name.replace(/\.[^.]+$/, "")); }} /><Upload />{file ? <><strong>{file.name}</strong><span>{fmtSize(file.size)}</span></> : <><strong>Choose an audio file</strong><span>WAV, AIFF, FLAC, MP3, AAC, or M4A</span></>}</label>{!asset && <label className="field-label">Track name<Input value={title} onChange={(e) => setTitle(e.target.value)} /></label>}<label className="field-label">Folder<select value={folderId} onChange={(e) => setFolderId(e.target.value)} disabled={!!asset}>{audioFolders.map((f) => <option key={f.id} value={f.id}>{folderLabel(f, folders)}</option>)}</select></label>{uploading && <div className="upload-progress"><i style={{ width: `${progress}%` }} /><span>{progress}% uploaded</span></div>}<DialogFooter><Button variant="outline" onClick={() => setOpen(false)} disabled={uploading}>Cancel</Button><Button onClick={upload} disabled={!file || !folderId || !title.trim() || uploading}>{uploading ? "Uploading…" : asset ? "Upload new version" : "Upload audio"}</Button></DialogFooter></DialogContent></Dialog>;
}

function ArtworkDialog({ open, setOpen, projectId, folder, dark, hasArtwork, after }: { open: boolean; setOpen: (value: boolean) => void; projectId: string; folder: FolderRow | null; dark: boolean; hasArtwork: boolean; after: () => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null), [progress, setProgress] = useState(0), [uploading, setUploading] = useState(false);
  useEffect(() => { if (open) { setFile(null); setProgress(0); } }, [open]);
  const upload = async () => {
    if (!file || !folder) return;
    try { setUploading(true); const params = new URLSearchParams({ projectId, folderId: folder.id, fileName: file.name }); await xhrUpload(`/api/artwork?${params}`, file, setProgress); setOpen(false); await after(); toast.success(hasArtwork ? "Artwork replaced" : "Artwork uploaded"); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Artwork upload failed"); }
    finally { setUploading(false); }
  };
  return <Dialog open={open} onOpenChange={(value) => !uploading && setOpen(value)}><DialogContent className={`workspace-dialog ${dark ? "workspace-dialog-dark" : ""}`}><DialogHeader><DialogTitle>{hasArtwork ? "Replace project artwork" : "Upload project artwork"}</DialogTitle><DialogDescription>Choose one image for this project. It will appear over the workspace background at 10% opacity.</DialogDescription></DialogHeader><label className="drop-file artwork-drop"><input type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /><ImageIcon />{file ? <><strong>{file.name}</strong><span>{fmtSize(file.size)}</span></> : <><strong>Choose an image</strong><span>JPEG, PNG, or WebP · up to 20 MB</span></>}</label>{uploading && <div className="upload-progress"><i style={{ width: `${progress}%` }} /><span>{progress}% uploaded</span></div>}<DialogFooter><Button variant="outline" onClick={() => setOpen(false)} disabled={uploading}>Cancel</Button><Button onClick={upload} disabled={!file || !folder || uploading}>{uploading ? "Uploading…" : hasArtwork ? "Replace artwork" : "Upload artwork"}</Button></DialogFooter></DialogContent></Dialog>;
}

function ShareDialog({ open, setOpen, projectId, dark, after }: { open: boolean; setOpen: (v: boolean) => void; projectId: string; dark: boolean; after: () => Promise<void> }) {
  const [role, setRole] = useState("reviewer"), [saving, setSaving] = useState(false), [copying, setCopying] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const save = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const email = String(new FormData(event.currentTarget).get("email") ?? "").trim(); if (!email) return; try { setSaving(true); await jsonRequest("/api/invites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId, email, role }) }); formRef.current?.reset(); setOpen(false); await after(); toast.success("Collaborator added"); } catch (e) { toast.error(e instanceof Error ? e.message : "Could not add collaborator"); } finally { setSaving(false); } };
  const copyReviewLink = async () => { try { setCopying(true); const result = await jsonRequest<{ token: string }>("/api/shares", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId }) }); const link = `${window.location.origin}/?share=${encodeURIComponent(result.token)}`; await copyText(link); setOpen(false); toast.success("Review link copied"); } catch (e) { toast.error(e instanceof Error ? e.message : "Could not create review link"); } finally { setCopying(false); } };
  return <Dialog open={open} onOpenChange={(next) => { if (!saving && !copying) { if (!next) formRef.current?.reset(); setOpen(next); } }}><DialogContent className={`workspace-dialog ${dark ? "workspace-dialog-dark" : ""}`}><form ref={formRef} className="dialog-form" onSubmit={save}><DialogHeader><DialogTitle>Share this project</DialogTitle><DialogDescription>Anyone with the public view link can open this project, play its audio, and read notes without signing in. They cannot comment or edit.</DialogDescription></DialogHeader><Button type="button" variant="outline" className="copy-review-link" onClick={copyReviewLink} disabled={copying}><Link2 />{copying ? "Creating link…" : "Copy public view link"}</Button><div className="dialog-divider"><span>or invite a collaborator</span></div><label className="field-label">Email address<Input name="email" type="email" placeholder="name@example.com" autoComplete="email" /></label><label className="field-label">Role<select value={role} onChange={(e) => setRole(e.target.value)}><option value="reviewer">Reviewer — play and comment</option><option value="contributor">Contributor — upload and organize</option></select></label><DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Adding…" : "Add collaborator"}</Button></DialogFooter></form></DialogContent></Dialog>;
}

const ProjectDialog = memo(function ProjectDialog({ open, setOpen, mode, currentArtist, dark, after }: { open: boolean; setOpen: (v: boolean) => void; mode: "project" | "artist"; currentArtist: string; dark: boolean; after: (id: string) => Promise<void> }) {
  const [saving, setSaving] = useState(false); const formRef = useRef<HTMLFormElement>(null);
  const save = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const values = new FormData(event.currentTarget), name = String(values.get("name") ?? "").trim(), artist = String(values.get("artist") ?? "").trim(); if (!name || !artist) return; try { setSaving(true); const r = await jsonRequest<{ id: string }>("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, artist }) }); formRef.current?.reset(); setOpen(false); await after(r.id); toast.success("Project created"); } catch (e) { toast.error(e instanceof Error ? e.message : "Could not create project"); } finally { setSaving(false); } };
  return <Dialog open={open} onOpenChange={(next) => { if (!saving) { if (!next) formRef.current?.reset(); setOpen(next); } }}><DialogContent className={`workspace-dialog ${dark ? "workspace-dialog-dark" : ""}`}><form ref={formRef} className="dialog-form" onSubmit={save}><DialogHeader><DialogTitle>{mode === "artist" ? "New artist" : "New project"}</DialogTitle><DialogDescription>{mode === "artist" ? "Create an artist and their first project." : `Create another project for ${currentArtist}.`}</DialogDescription></DialogHeader>{mode === "artist" && <label className="field-label">Artist or client<Input name="artist" autoFocus autoComplete="off" /></label>}<label className="field-label">Project name<Input name="name" autoFocus={mode === "project"} autoComplete="off" /></label>{mode === "project" && <input type="hidden" name="artist" value={currentArtist} />}<DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Creating…" : mode === "artist" ? "Create artist" : "Create project"}</Button></DialogFooter></form></DialogContent></Dialog>;
});

function RenameDialog({ target, setTarget, projectId, dark, after }: { target: RenameTarget | null; setTarget: (target: RenameTarget | null) => void; projectId: string; dark: boolean; after: () => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const labels = { artist: "artist", project: "project", folder: "folder", asset: "track" } as const;
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!target) return;
    const value = String(new FormData(event.currentTarget).get("name") ?? "").trim(); if (!value) return;
    const endpoint = target.kind === "artist" || target.kind === "project" ? "/api/projects" : target.kind === "folder" ? "/api/folders" : "/api/assets";
    const body = target.kind === "artist" ? { projectId, artist: value, renameArtist: true } : target.kind === "project" ? { projectId, name: value } : target.kind === "folder" ? { folderId: target.id, name: value } : { assetId: target.id, title: value };
    try { setSaving(true); await jsonRequest(endpoint, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); setTarget(null); await after(); toast.success(`${labels[target.kind][0].toUpperCase()}${labels[target.kind].slice(1)} renamed`); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not rename this item"); }
    finally { setSaving(false); }
  };
  const label = target ? labels[target.kind] : "item";
  return <Dialog open={!!target} onOpenChange={(open) => { if (!open && !saving) setTarget(null); }}><DialogContent className={`workspace-dialog ${dark ? "workspace-dialog-dark" : ""}`}><form className="dialog-form" onSubmit={save}><DialogHeader><DialogTitle>Rename {label}</DialogTitle><DialogDescription>{target?.kind === "artist" ? "This updates the artist name across all of their projects that you own." : `Give this ${label} a new name.`}</DialogDescription></DialogHeader><label className="field-label">{label[0].toUpperCase()}{label.slice(1)} name<Input name="name" key={target?.id} defaultValue={target?.value ?? ""} autoFocus autoComplete="off" /></label><DialogFooter><Button type="button" variant="outline" onClick={() => setTarget(null)} disabled={saving}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save name"}</Button></DialogFooter></form></DialogContent></Dialog>;
}

function MoveAssetDialog({ asset, setAsset, folders, dark, after }: { asset: Asset | null; setAsset: (asset: Asset | null) => void; folders: FolderRow[]; dark: boolean; after: (destinationId: string) => Promise<void> }) {
  const destinationFolders = folders.filter((folder) => folder.parentId || folder.name !== "Artwork");
  const [folderId, setFolderId] = useState(""), [saving, setSaving] = useState(false);
  useEffect(() => { if (asset) setFolderId(asset.folderId); }, [asset]);
  const move = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!asset || !folderId || folderId === asset.folderId) return;
    try { setSaving(true); await jsonRequest("/api/assets", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assetId: asset.id, folderId }) }); setAsset(null); await after(folderId); toast.success("Track moved with all versions and notes"); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not move this track"); }
    finally { setSaving(false); }
  };
  return <Dialog open={!!asset} onOpenChange={(open) => { if (!open && !saving) setAsset(null); }}><DialogContent className={`workspace-dialog ${dark ? "workspace-dialog-dark" : ""}`}><form className="dialog-form" onSubmit={move}><DialogHeader><DialogTitle>Move {asset?.title ?? "track"}</DialogTitle><DialogDescription>The track’s complete version history and every timeline note will move with it.</DialogDescription></DialogHeader><label className="field-label">Destination folder<select value={folderId} onChange={(event) => setFolderId(event.target.value)} autoFocus>{destinationFolders.map((folder) => <option key={folder.id} value={folder.id}>{folderLabel(folder, folders)}</option>)}</select></label><DialogFooter><Button type="button" variant="outline" onClick={() => setAsset(null)} disabled={saving}>Cancel</Button><Button type="submit" disabled={saving || !folderId || folderId === asset?.folderId}>{saving ? "Moving…" : "Move track"}</Button></DialogFooter></form></DialogContent></Dialog>;
}

function DeleteAssetDialog({ asset, setAsset, dark, after }: { asset: Asset | null; setAsset: (asset: Asset | null) => void; dark: boolean; after: () => Promise<void> }) {
  const [deleting, setDeleting] = useState(false);
  const remove = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault(); if (!asset) return;
    try { setDeleting(true); await jsonRequest("/api/assets", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assetId: asset.id }) }); setAsset(null); await after(); toast.success("Track deleted"); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not delete this track"); }
    finally { setDeleting(false); }
  };
  return <AlertDialog open={!!asset} onOpenChange={(open) => { if (!open && !deleting) setAsset(null); }}><AlertDialogContent className={`workspace-dialog ${dark ? "workspace-dialog-dark" : ""}`}><AlertDialogHeader><AlertDialogTitle>Delete {asset?.title ?? "this track"}?</AlertDialogTitle><AlertDialogDescription>This permanently deletes the track, every uploaded version, and all of its timeline notes. This cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={deleting} onClick={remove}>{deleting ? "Deleting…" : "Delete track"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>;
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(value); return; }
  window.prompt("Copy this review link:", value);
}

function readDuration(file: File): Promise<number> {
  return new Promise((resolve) => { const audio = document.createElement("audio"), url = URL.createObjectURL(file); const done = (value: number) => { URL.revokeObjectURL(url); resolve(Number.isFinite(value) ? Math.round(value) : 0); }; audio.preload = "metadata"; audio.onloadedmetadata = () => done(audio.duration); audio.onerror = () => done(0); audio.src = url; });
}
function xhrUpload(url: string, file: File, onProgress: (n: number) => void): Promise<{ assetId: string; versionId: string }> {
  return new Promise((resolve, reject) => { const xhr = new XMLHttpRequest(); xhr.open("POST", url); xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream"); xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); }; xhr.onload = () => { let body: { assetId?: string; versionId?: string; error?: string } = {}; try { body = JSON.parse(xhr.responseText); } catch {} if (xhr.status >= 200 && xhr.status < 300 && body.assetId && body.versionId) resolve({ assetId: body.assetId, versionId: body.versionId }); else reject(new Error(body.error ?? "Upload failed")); }; xhr.onerror = () => reject(new Error("Connection lost during upload")); xhr.send(file); });
}

import { FileAudio, FolderInput, FolderTree, MessageSquareText, Share2, Upload, Waves } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function Tutorial({ searchParams }: { searchParams: Promise<{ share?: string | string[] }> }) {
  const params = await searchParams;
  const share = typeof params.share === "string" ? params.share : null;
  const audioHref = share ? `/?share=${encodeURIComponent(share)}` : "/";
  return <div className="workspace tutorial-shell">
    <header className="topbar tutorial-topbar">
      <a className="brand" href={audioHref}>platform<span className="brand-mark" aria-hidden="true"><i /><i /><i /></span></a>
      <nav className="media-nav" aria-label="Media spaces"><a href={audioHref}>Audio</a><span title="Video testing comes next">Video</span><a className="active" href="/tutorial">Tutorial</a></nav>
      <a className="tutorial-open" href={audioHref}>Open Platform</a>
    </header>
    <main className="tutorial-main">
      <section className="tutorial-intro">
        <p className="eyebrow">Platform tutorial</p>
        <h1>From first upload to final approval.</h1>
        <p>Platform keeps every song, version, and time-stamped note in one clear workspace. Here’s how the main functions fit together.</p>
      </section>
      <ol className="tutorial-steps" aria-label="Quick start">
        <li><span>1</span><strong>Choose an artist and project</strong><p>Use the left project selector to move between clients and releases.</p></li>
        <li><span>2</span><strong>Open or create a song</strong><p>New songs start with Mixes, Masters, References, and Stems.</p></li>
        <li><span>3</span><strong>Upload the track</strong><p>Put the audio in its target folder and give it a clear track name.</p></li>
        <li><span>4</span><strong>Play, note, and share</strong><p>Review the waveform, leave precise notes, then send the project.</p></li>
      </ol>
      <section className="tutorial-grid" aria-label="Platform functions">
        <article><FolderTree /><div><h2>Artists, projects, and folders</h2><p>Every project starts with Songs, Artwork, and References. Songs can contain folders and subfolders; Artwork holds one image that appears softly behind the workspace. Use <strong>New folder</strong> beside Upload audio to build inside your current location.</p></div></article>
        <article><Upload /><div><h2>Uploads and versions</h2><p>Upload a new track into Mixes, Masters, References, or Stems. Once a track exists, use <strong>New version</strong> so the newest upload stays in focus without losing earlier iterations.</p></div></article>
        <article><Waves /><div><h2>Playback and the waveform</h2><p>Press play or click anywhere on the waveform to move the playhead. The highlighted waveform shows playback progress, and the version tabs let you compare every iteration.</p></div></article>
        <article><MessageSquareText /><div><h2>Timeline notes</h2><p>Move the playhead to the exact moment you want to discuss, then choose <strong>Add note</strong>. Markers on the waveform and notes in the right panel jump back to that timestamp.</p></div></article>
        <article><FolderInput /><div><h2>Rename, move, and delete</h2><p>Open a track to rename it or move it into another folder. Moving keeps every version and note attached. Delete permanently removes the track, its uploads, and its notes after confirmation.</p></div></article>
        <article><Share2 /><div><h2>Sharing and permissions</h2><p>A <strong>public view link</strong> lets anyone play the audio and read notes without signing in. Email reviewers can comment; contributors can upload and organize; owners control the project.</p></div></article>
      </section>
      <section className="tutorial-tip"><FileAudio /><div><p className="eyebrow">Best practice</p><h2>Keep one track, then add versions.</h2><p>Use a single track for every iteration of the same mix. That keeps the comparison history and conversation together instead of scattering feedback across duplicate files.</p></div></section>
    </main>
  </div>;
}

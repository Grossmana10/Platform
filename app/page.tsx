import { chatGPTSignInPath, getChatGPTUser } from "./chatgpt-auth";
import Workspace from "./workspace";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ share?: string | string[] }> }) {
  const params = await searchParams;
  const shareToken = typeof params.share === "string" ? params.share : null;
  const returnTo = shareToken ? `/?share=${encodeURIComponent(shareToken)}` : "/";
  const user = await getChatGPTUser();
  if (!user && shareToken) return <Workspace user={{ name: "Guest", email: "View-only link" }} initialShareToken={shareToken} publicView />;
  if (!user) {
    return (
      <main className="signin-shell">
        <section className="signin-card">
          <a className="brand brand-large" href="/">platform<span className="brand-mark" aria-hidden="true"><i /><i /><i /></span></a>
          <div className="signin-wave" aria-hidden="true">
            {Array.from({ length: 48 }, (_, i) => <i key={i} style={{ height: `${18 + ((i * 29) % 64)}%` }} />)}
          </div>
          <p className="eyebrow">Private creative review</p>
          <h1>Hear the work. Leave the note exactly where it belongs.</h1>
          <p className="signin-copy">Sign in to upload lossless audio, manage versions, and review mixes with collaborators.</p>
          <a className="primary-link" href={chatGPTSignInPath(returnTo)} target="_top">Sign in with ChatGPT</a>
        </section>
      </main>
    );
  }
  return <Workspace user={{ name: user.displayName, email: user.email }} initialShareToken={shareToken} />;
}

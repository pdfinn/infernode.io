// /download/xenith/<asset> -> the matching file in the latest InferNode release.
//
// Release files carry the version in their names (xenith-0.10.0-linux-amd64.tar.gz),
// so GitHub's /releases/latest/download/<name> shortcut cannot be used with a fixed
// name. Instead, ask GitHub which tag /releases/latest points at (a plain redirect,
// not the rate-limited API), then send the visitor to that tag's file. The tag is
// cached at the edge for a few minutes. If anything fails, the visitor lands on the
// latest release page rather than an error.
const REPO = 'https://github.com/infernode-os/infernode';
const LATEST = `${REPO}/releases/latest`;
const ASSETS = new Set([
  'linux-amd64.tar.gz',
  'linux-arm64.tar.gz',
  'macos-arm64.dmg',
  'windows-amd64.zip',
]);
const TTL = 300; // seconds

async function latestTag(ctx) {
  const cache = caches.default;
  const key = new Request('https://infernode.io/__cache/xenith-latest-tag');
  const hit = await cache.match(key);
  if (hit) return hit.text();

  const res = await fetch(LATEST, {
    method: 'HEAD',
    redirect: 'manual',
    headers: { 'User-Agent': 'infernode.io-download-redirect' },
  });
  const loc = res.headers.get('Location') || '';
  const m = loc.match(/\/releases\/tag\/(v\d+\.\d+\.\d+[^/?#]*)$/);
  if (!m) throw new Error(`unexpected redirect: ${res.status} ${loc}`);
  const tag = m[1];
  ctx.waitUntil(
    cache.put(key, new Response(tag, { headers: { 'Cache-Control': `max-age=${TTL}` } })),
  );
  return tag;
}

export const onRequestGet = async (ctx) => {
  const asset = ctx.params.asset;
  if (!ASSETS.has(asset)) return Response.redirect(LATEST, 302);
  try {
    const tag = await latestTag(ctx);
    const version = tag.replace(/^v/, '');
    const url = `${REPO}/releases/download/${tag}/xenith-${version}-${asset}`;
    return new Response(null, {
      status: 302,
      headers: { Location: url, 'Cache-Control': `public, max-age=${TTL}` },
    });
  } catch (err) {
    console.error('xenith download redirect:', err);
    return Response.redirect(LATEST, 302);
  }
};

export const onRequestHead = onRequestGet;

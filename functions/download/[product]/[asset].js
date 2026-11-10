// /download/<product>/<asset> -> that file in the latest InferNode release.
//
//   /download/infernode/macos-arm64.dmg -> .../download/v0.10.0/infernode-0.10.0-macos-arm64.dmg
//   /download/xenith/windows-amd64.zip  -> .../download/v0.10.0/xenith-0.10.0-windows-amd64.zip
//
// Release files carry the version in their names, so GitHub's
// /releases/latest/download/<name> shortcut cannot be used with a fixed name.
// Instead, ask GitHub which tag /releases/latest points at (a plain redirect,
// not the rate-limited API), then send the visitor to that tag's file. The tag
// is cached at the edge for a few minutes. If anything fails, or the file isn't
// one we list, the visitor lands on the latest release page rather than an error.
//
// Link to these paths from the site. Never put a version number in a link.
const REPO = 'https://github.com/infernode-os/infernode';
const LATEST = `${REPO}/releases/latest`;
const ASSETS = {
  infernode: new Set([
    'macos-arm64.dmg',
    'macos-amd64.dmg',
    'linux-amd64-gui.tar.gz',
    'linux-arm64-gui.tar.gz',
    'linux-amd64.tar.gz',
    'linux-arm64.tar.gz',
    'windows-amd64-gui.zip',
    'windows-amd64.zip',
    'rpi4b.img.xz',
    'rpi3bplus.img.xz',
  ]),
  xenith: new Set([
    'linux-amd64.tar.gz',
    'linux-arm64.tar.gz',
    'macos-arm64.dmg',
    'windows-amd64.zip',
  ]),
};
const TTL = 300; // seconds

async function latestTag(ctx) {
  const cache = caches.default;
  const key = new Request('https://infernode.io/__cache/latest-release-tag');
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
  const { product, asset } = ctx.params;
  if (!Object.hasOwn(ASSETS, product) || !ASSETS[product].has(asset)) {
    return Response.redirect(LATEST, 302);
  }
  try {
    const tag = await latestTag(ctx);
    const version = tag.replace(/^v/, '');
    const url = `${REPO}/releases/download/${tag}/${product}-${version}-${asset}`;
    return new Response(null, {
      status: 302,
      headers: { Location: url, 'Cache-Control': `public, max-age=${TTL}` },
    });
  } catch (err) {
    console.error('download redirect:', err);
    return Response.redirect(LATEST, 302);
  }
};

export const onRequestHead = onRequestGet;

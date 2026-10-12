// Serve the site from one host. www and the production *.pages.dev alias
// 301 to the canonical apex, so search engines and analytics see a single
// site. Per-deploy preview hosts (<hash>.infernode-io.pages.dev) are left alone.
const ALIASES = new Set(['www.infernode.io', 'infernode-io.pages.dev']);

export const onRequest = ({ request, next }) => {
  const url = new URL(request.url);
  if (ALIASES.has(url.hostname)) {
    url.hostname = 'infernode.io';
    return Response.redirect(url.toString(), 301);
  }
  return next();
};

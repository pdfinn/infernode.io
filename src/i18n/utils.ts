import { ui as en } from './en';
import { ui as zh } from './zh';

export type Lang = 'en' | 'zh';

export const dictionaries = { en, zh } as const;

export function getLangFromUrl(url: URL): Lang {
  return url.pathname.startsWith('/zh/') || url.pathname === '/zh' ? 'zh' : 'en';
}

export function useTranslations(lang: Lang) {
  return dictionaries[lang];
}

// Site is configured with trailingSlash: 'always', so every path-bearing
// link must end in '/'. Anchors and hash-only links are left alone.
function ensureTrailingSlash(path: string): string {
  if (!path || path.startsWith('#')) return path;
  const hashIdx = path.indexOf('#');
  const pure = hashIdx === -1 ? path : path.slice(0, hashIdx);
  const hash = hashIdx === -1 ? '' : path.slice(hashIdx);
  const withSlash = pure.endsWith('/') ? pure : pure + '/';
  return withSlash + hash;
}

// Map a current pathname to its counterpart in the other locale.
// /            <-> /zh/
// /veltro/     <-> /zh/veltro/
// /compare/    <-> /zh/compare/
export function localizedPath(pathname: string, target: Lang): string {
  const isZh = pathname.startsWith('/zh/') || pathname === '/zh';
  const stripped = ensureTrailingSlash(isZh ? pathname.replace(/^\/zh/, '') || '/' : pathname);
  if (target === 'en') return stripped;
  if (stripped === '/') return '/zh/';
  return `/zh${stripped}`;
}

// Internal links inside a given locale (e.g. CTA buttons).
// p('/manifesto', 'en') -> '/manifesto/'
// p('/manifesto', 'zh') -> '/zh/manifesto/'
// p('/#quickstart', 'zh') -> '/zh/#quickstart'
// p('#anchor', 'zh') -> '#anchor'
export function p(path: string, lang: Lang): string {
  if (path.startsWith('#')) return path;
  const withSlash = ensureTrailingSlash(path);
  if (lang === 'en') return withSlash;
  if (withSlash === '/') return '/zh/';
  return `/zh${withSlash}`;
}

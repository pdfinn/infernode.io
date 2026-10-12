// Google Analytics, shared by the marketing layout (Base.astro) and the
// Starlight docs (astro.config.mjs `head`). Only the production hostnames
// report, so *.pages.dev preview deploys and local dev do not pollute the data.
export const GA_ID = 'G-QKDT1LMPGR';

export const GA_SRC = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;

export const GA_INIT = `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
if (/^(www\\.)?infernode\\.io$/.test(location.hostname)) {
  gtag('js', new Date());
  gtag('config', '${GA_ID}');
}`;

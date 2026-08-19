// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
  output: 'static',
  site: 'https://infernode.io',
  trailingSlash: 'always',
  i18n: {
    locales: ['en', 'zh'],
    defaultLocale: 'en',
    routing: {
      prefixDefaultLocale: false,
    },
  },
  integrations: [
    // Docs are English-only for now. Starlight routes are generated from the
    // path *inside* src/content/docs/, so the extra docs/ nesting in that tree
    // is what mounts them at infernode.io/docs/ rather than at the site root.
    starlight({
      title: 'InferNode',
      description:
        'Install InferNode, run the tour, and give a contained agent its first task.',
      logo: {
        src: './public/infernode-icon.png',
        alt: 'InferNode',
        replacesTitle: false,
      },
      favicon: '/infernode-icon.png',
      customCss: ['./src/styles/docs.css'],
      // Starlight inherits the site's en/zh locales and cannot be given its own
      // (it errors if both are set). Docs are English-only for now, so Starlight
      // falls back to English under /zh/docs/. That is fine for readers but must
      // not reach the sitemap as duplicate content — see the sitemap filter below.
      // When zh translations land they go in src/content/docs/zh/docs/.
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/infernode-os/infernode',
        },
      ],
      // Starlight's default site title already links to '/', which is the
      // marketing home page — no override needed to get back out of the docs.
      sidebar: [
        {
          label: 'Get started',
          items: [
            { label: 'Quick start', link: '/docs/quick-start/' },
            { label: '1. Install and launch', link: '/docs/quick-start/install/' },
            { label: '2. Connect a model', link: '/docs/quick-start/connect-a-model/' },
            { label: '3. Run the tour', link: '/docs/quick-start/run-the-tour/' },
            {
              label: '4. Everything is a file',
              link: '/docs/quick-start/everything-is-a-file/',
            },
          ],
        },
        {
          label: 'Go further',
          items: [
            {
              label: '5. Give Veltro a task',
              link: '/docs/quick-start/give-veltro-a-task/',
            },
            {
              label: '6. Namespaces contain',
              link: '/docs/quick-start/namespaces-contain/',
            },
          ],
        },
      ],
      pagination: true,
      lastUpdated: false,
      editLink: {
        baseUrl: 'https://github.com/pdfinn/infernode.io/edit/main/',
      },
    }),
    // /zh/docs/* is Starlight's English fallback for an untranslated locale.
    // Keep it reachable but out of the index so it is not duplicate content.
    sitemap({ filter: (page) => !page.includes('/zh/docs/') }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});

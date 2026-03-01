// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

import cloudflare from '@astrojs/cloudflare';

// https://astro.build/config
export default defineConfig({
  output: 'static',
  site: 'https://infernode.io',

  vite: {
    plugins: [tailwindcss()]
  },

  adapter: cloudflare()
});
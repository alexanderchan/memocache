// @ts-check
import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'
import tailwindcss from '@tailwindcss/vite'

// https://astro.build/config
export default defineConfig({
  site: 'https://cache.alexmchan.com',
  base: '',
  integrations: [
    starlight({
      title: 'Memocache Docs',
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/alexanderchan/memocache' },
      ],
      editLink: {
        baseUrl: 'https://github.com/alexanderchan/memocache/edit/main/docs',
      },
      sidebar: [
        {
          label: 'Guides',
          items: [
            { label: 'Getting Started', slug: 'guides/getting-started' },
            { label: 'Examples', slug: 'guides/examples' },
          ],
        },
        {
          label: 'Concepts',
          items: [
            { label: 'How It Works', slug: 'concepts/how-it-works' },
          ],
        },
        {
          label: 'Reference',
          items: [
            { label: 'API Reference', slug: 'reference/api' },
            { label: 'Stores', slug: 'reference/stores' },
            { label: 'Middleware', slug: 'reference/middleware' },
          ],
        },
        {
          label: 'Advanced',
          items: [
            { label: 'Serverless Context', slug: 'advanced/serverless-context' },
          ],
        },
        {
          label: 'Testing',
          items: [{ label: 'MSW Testing', slug: 'testing/msw-testing' }],
        },
      ],
      customCss: ['./src/tailwind.css'],
      favicon: '/favicon.ico',
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
})

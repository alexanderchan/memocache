// @ts-check
import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'
import tailwind from '@astrojs/tailwind'

// https://astro.build/config
export default defineConfig({
  site: 'https://cache.alexmchan.com',
  base: '',
  integrations: [
    starlight({
      title: 'Memocache Docs',
      social: {
        github: 'https://github.com/alexanderchan/memocache',
      },
      editLink: {
        baseUrl: 'https://github.com/alexanderchan/memocache/edit/main/docs',
      },
      sidebar: [
        {
          label: 'Docs',
          items: [
            // Each item here is one entry in the navigation menu.
            { label: 'Usage', slug: 'guides/usage' },
          ],
        },
        // {
        //   label: 'Reference',
        //   autogenerate: { directory: 'reference' },
        // },
      ],
      customCss: ['./src/tailwind.css'],
    }),
    tailwind({ applyBaseStyles: false }),
  ],
})

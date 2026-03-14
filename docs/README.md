# Docs

This directory contains the maintained Starlight documentation site for memocache.

## Commands

Run from [`/Users/alexanderchan/dev/myprojects/cache/docs`](/Users/alexanderchan/dev/myprojects/cache/docs):

```bash
pnpm install
pnpm dev
pnpm build
```

## Notes

- Root package documentation should be updated here first.
- Package READMEs are no longer copied into the docs site.
- Diagrams live in `src/assets/` and can be regenerated with `pnpm generate:diagrams`.

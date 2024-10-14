## Usage

Uses the eslint flatconfig format:

```bash
pnpm install @repo/eslint-config
```

which should add

```json

"devDependencies": {
    "@repo/eslint-config": "workspace:^",
}
```

`.eslint.config.mjs`

```ts
// @ts-check

import repoEslintConfig from '@repo/eslint-config'

export default [
  ...repoEslintConfig,
  ...reposEslintConfig.configs.react, // for react projects
]
```

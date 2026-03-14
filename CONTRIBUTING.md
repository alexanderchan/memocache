## Contributing

We welcome contributions to this project. Please read the [Contributing Guidelines](CONTRIBUTING.md) for more information.

### Local setup

Install dependencies with `pnpm`:

```sh
pnpm install
```

This repo uses Husky for git hooks. The `prepare` script installs the hooks during `pnpm install`.

If your pnpm setup blocks install scripts, approve them and reinstall:

```sh
pnpm approve-builds
pnpm install
```

If you only need to install the hooks for the current clone, you can run:

```sh
pnpm exec husky
```

You can verify the hooks are installed with:

```sh
ls -l .git/hooks/pre-commit
ls -l .git/hooks/pre-push
```

The pre-commit hook runs:

```sh
pnpm lint:staged
```

The pre-push hook runs:

```sh
pnpm test:ci
```

### Deploying

Local only deployment at this time:

```sh
pnpm changeset version
pnpm release:local
git push --follow-tags
```

# Contributing

We welcome contributions of all kinds — bug reports, feature requests, documentation, and code.

---

## Quick Start

1. **Fork** the repo on GitHub
2. **Clone** your fork: `git clone https://github.com/YOUR_USERNAME/boardupscale.git`
3. Set up the [development environment](Development-Setup)
4. Create a **feature branch**: `git checkout -b feat/your-feature`
5. Make your changes
6. **Push** and open a **Pull Request** against `main`

See [CONTRIBUTING.md](https://github.com/codeupscale/boardupscale/blob/main/CONTRIBUTING.md) for the full guide.

---

## Reporting Bugs

1. Search [existing issues](https://github.com/codeupscale/boardupscale/issues) — it may already be reported
2. Open a [Bug Report](https://github.com/codeupscale/boardupscale/issues/new?template=bug_report.yml)
3. Include: steps to reproduce, expected vs. actual behaviour, version, and deployment type

---

## Requesting Features

1. Search [existing discussions](https://github.com/codeupscale/boardupscale/discussions) first
2. Open a [Feature Request](https://github.com/codeupscale/boardupscale/issues/new?template=feature_request.yml)

---

## Code Style

- **NestJS modules** — follow the existing module pattern (controller → service → entity → dto)
- **TypeScript** — strict mode; no `any` unless absolutely necessary
- **React** — functional components with hooks; no class components
- **SQL** — never use `synchronize: true` in production; always write migrations
- **Commits** — [Conventional Commits](https://www.conventionalcommits.org/):
  - `feat:` new feature
  - `fix:` bug fix
  - `docs:` documentation only
  - `refactor:` no behaviour change
  - `test:` tests only
  - `chore:` build/tooling

---

## Testing

All new features and bug fixes should include tests.

```bash
cd services/api
npm test              # unit tests
npm run test:cov      # with coverage report
npm run test:e2e      # end-to-end tests
```

Target: **80%+ coverage** for new code.

---

## Security

Found a vulnerability? **Do not open a public issue.**

Email `security@boardupscale.com` or use [GitHub Security Advisories](https://github.com/codeupscale/boardupscale/security/advisories/new).

See [SECURITY.md](https://github.com/codeupscale/boardupscale/blob/main/SECURITY.md) for the responsible disclosure process.

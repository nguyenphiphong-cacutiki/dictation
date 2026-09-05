# Claude Code Instructions

## After every code change — run CI checks

After completing **any** code change (backend, frontend, or terraform), always run:

```bash
./ci.sh
```

This script mirrors `.github/workflows/ci.yml` exactly and must pass before committing.

### Run a single section when only one area changed

```bash
./ci.sh backend-lint        # ruff — after editing Python files
./ci.sh backend-security    # pip-audit + bandit — after changing requirements.txt
./ci.sh backend-test        # pytest — after editing backend logic or tests
./ci.sh frontend-lint       # eslint — after editing JSX/JS files
./ci.sh frontend-audit      # npm audit — after changing package.json
./ci.sh frontend-test       # vitest — after editing frontend logic or tests
./ci.sh frontend-build      # vite build — after any frontend change before push
./ci.sh terraform-fmt       # terraform fmt -check — after editing .tf files
```

### What each section checks

| Section | Tool | What it catches |
|---|---|---|
| `backend-security` | pip-audit + bandit | Python dependency CVEs, insecure code patterns |
| `backend-lint` | ruff | Unused imports, naming violations, style errors |
| `backend-test` | pytest | Regressions in backend logic |
| `frontend-audit` | npm audit | JS dependency CVEs |
| `frontend-lint` | eslint | Unused vars, unescaped entities, empty blocks |
| `frontend-test` | vitest | Regressions in frontend logic |
| `frontend-build` | vite build | Build errors, missing imports |
| `terraform-fmt` | terraform fmt | Formatting drift in .tf files |

### Terraform formatting — auto-fix

`terraform fmt -check` only reports; to fix run:

```bash
terraform fmt -recursive terraform/
```

Then re-run `./ci.sh terraform-fmt` to confirm.

## test aware
After completing any code changes (feature, bug fix, or refactor), always apply the `testdoc_cover` skill to ensure adequate test coverage and quality before reporting completion.

### Lock file out of sync

If `frontend-audit` or `frontend-lint` fails with a lock file sync error:

```bash
cd frontend && rm package-lock.json && npm install && cd ..
./ci.sh frontend-audit
```

Never commit a `package-lock.json` generated with `npm install` on top of an existing (stale) lock file — always delete it first for a clean resolve.

## don't do any add and commit yourself to git
- don't self run any command like git add, git commit, git push
- you don't have permission to change git commit or git history
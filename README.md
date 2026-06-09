# Daily Dictation

A serverless English dictation practice platform built on AWS. Users listen to audio clips and type what they hear, track their progress across lessons, and share community-contributed content. Authentication is passwordless — a one-time code is sent via email, with no passwords stored anywhere.

---

## Architecture

```
User Browser
     │
     ▼
┌─────────────────────────────────────────┐
│           CloudFront (CDN)              │
│  ┌──────────────┐  ┌──────────────────┐ │
│  │  Default /*  │  │  /api/* behavior │ │
│  │  (S3 SPA)    │  │  (API Gateway)   │ │
│  └──────┬───────┘  └────────┬─────────┘ │
└─────────┼────────────────────┼───────────┘
          │                    │
          ▼                    ▼
   ┌─────────────┐    ┌────────────────────┐
   │  S3 Bucket  │    │  API Gateway (HTTP) │
   │  (React SPA)│    └──────────┬─────────┘
   └─────────────┘               │
                                 ▼
                        ┌────────────────┐
                        │  AWS Lambda    │
                        │  (Python 3.12) │
                        └───────┬────────┘
                                │
              ┌─────────────────┼──────────────────┐
              │                 │                  │
              ▼                 ▼                  ▼
       ┌──────────┐     ┌──────────────┐    ┌──────────┐
       │ DynamoDB │     │  S3 (Audio)  │    │   SES    │
       │ Tables   │     │   Assets     │    │  (Email) │
       └──────────┘     └──────────────┘    └──────────┘
```

### Components

| Layer | Technology | Notes |
|---|---|---|
| Frontend | React 18, React Router, Tailwind CSS, Vite | SPA hosted on S3, served via CloudFront |
| Backend | Python 3.12 on AWS Lambda | Single handler function, route-dispatched |
| API | AWS API Gateway HTTP API (v2) | Fronted by CloudFront at `/api/*` |
| Database | AWS DynamoDB | Tables: users, otp, lessons, progress, sessions, config |
| Audio Storage | AWS S3 | Pre-signed URLs for time-limited playback |
| Email | AWS SES | OTP delivery for passwordless login |
| DNS | Cloudflare | DNS management + Cloudflare zone |
| TLS | AWS ACM | Certificate provisioned in `us-east-1` for CloudFront |
| Infrastructure | Terraform | Modular, per-environment (`dev` / `stg` / `prod`) |
| State Backend | S3 + DynamoDB | Versioned remote state with lock table |

### Authentication Flow

Passwordless OTP via email:

1. User submits their email address
2. Lambda generates a 6-digit OTP, stores it in DynamoDB with a 10-minute TTL, and sends it via SES
3. User submits the OTP; Lambda validates it, deletes it, and issues a signed JWT
4. Subsequent requests carry the JWT in the `Authorization` header; Lambda verifies it on every call

---

## How to Use

### Prerequisites

- AWS CLI configured with appropriate credentials
- Terraform >= 1.5
- Node.js >= 20
- Python >= 3.12

### Bootstrap remote state (one-time, per AWS account)

```bash
cd terraform/bootstrap
terraform init
terraform apply
```

This creates the S3 bucket and DynamoDB table used to store Terraform state.

### Deploy to an environment

```bash
bash deploy.sh dev    # or stg, or prod
```

The script performs these steps in order:

1. Builds the Lambda deployment package (`backend/build.sh`)
2. Runs `terraform apply` for the target environment
3. Builds the React frontend (`vite build`)
4. Syncs static assets to S3 (immutable cache headers for hashed assets, `no-cache` for `index.html`)
5. Creates a CloudFront cache invalidation

### Local development

**Backend** — no local server required; run tests directly:

```bash
cd backend
pip install pytest pytest-cov PyJWT boto3
python -m pytest tests/ -v
```

**Frontend:**

```bash
cd frontend
npm install
npm run dev     # Vite dev server on http://localhost:5173
```

---

## CI/CD Pipeline

The pipeline follows a **branch-based promotion** model across three long-lived environments:

```
feature/* ──► develop ──► staging ──► main
                │             │         │
               dev           stg       prod
```

### Workflow overview

| Trigger | Workflow | What runs |
|---|---|---|
| PR → `develop`, `staging`, `main` | `ci.yml` | Full quality + security gate (blocks merge) |
| Push to `develop` | `deploy-dev.yml` | Auto-deploy to dev environment |
| Push to `staging` | `deploy-stg.yml` | Auto-deploy to staging environment |
| Push to `main` | `deploy-prod.yml` | Manual approval gate → deploy to prod |
| Every Sunday 02:00 UTC + push to `main` | `security.yml` | Full scheduled security scan |

### CI Gate pattern

The CI workflow runs all jobs **in parallel** and then collects their results in a single `ci-gate` job. The gate fails the workflow if **any** job produced a `failure` or `cancelled` result — meaning all checks must be green before a PR can merge.

```
PR opened
    │
    ├── secret-scan       (Gitleaks)
    ├── backend-security  (pip-audit + Bandit)
    ├── frontend-audit    (npm audit)
    ├── terraform-security(tfsec)
    ├── backend-lint      (ruff)
    ├── backend-test      (pytest)
    ├── frontend-lint     (ESLint)
    ├── frontend-test     (vitest)
    ├── frontend-build    (vite build)  ← needs frontend-test + frontend-lint
    └── terraform-fmt     (terraform fmt -check)
           │
           ▼
       ci-gate ──► all passed? → PR can merge
```

### Production approval gate

Pushes to `main` trigger a `deploy-prod` workflow that contains an `approval` job mapped to the `prod` GitHub Environment. A designated reviewer must approve before the `deploy` job runs.

### AWS authentication

All deploy workflows authenticate to AWS using **OIDC** (`aws-actions/configure-aws-credentials`). No long-lived AWS access keys are stored as secrets — GitHub's OIDC token is exchanged for short-lived IAM role credentials at runtime.

### Running CI locally

The `ci.sh` script mirrors the GitHub Actions workflow exactly:

```bash
./ci.sh                   # run all sections
./ci.sh backend-lint      # run one section only
./ci.sh backend-test
./ci.sh frontend-build
./ci.sh terraform-fmt
```

---

## Code Scanning Tools

The pipeline integrates multiple layers of automated scanning:

| Tool | Category | What it catches |
|---|---|---|
| **Gitleaks** | Secret detection | Hardcoded API keys, tokens, passwords in commits and full git history |
| **pip-audit** | Dependency CVE | Known vulnerabilities in Python packages |
| **Bandit** | Python SAST | Insecure code patterns (SQL injection, shell injection, weak crypto, etc.) |
| **npm audit** | Dependency CVE | Known vulnerabilities in JavaScript packages (high severity threshold) |
| **tfsec** | Infrastructure SAST | Misconfigured AWS resources, open security groups, missing encryption, etc. |
| **ruff** | Python linting | Unused imports, naming violations, style errors (fast Rust-based linter) |
| **ESLint** | JS linting | Unused variables, missing hook deps, unescaped JSX entities |

Security scans run on every PR and also on a weekly cron schedule (`security.yml`) to catch newly published CVEs even when the code hasn't changed.

---

## Project Structure

```
.
├── backend/               # Python Lambda handler
│   ├── handler.py         # Entry point — routes requests by path
│   ├── routes/            # One module per API domain (auth, lessons, progress, …)
│   ├── shared/            # Auth helpers, DynamoDB client, response builders
│   ├── tests/             # pytest unit tests
│   ├── build.sh           # Packages lambda.zip + lambda_layer.zip
│   └── requirements.txt
│
├── frontend/              # React SPA
│   ├── src/
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── vite.config.js
│   └── package.json
│
├── terraform/
│   ├── bootstrap/         # One-time S3 + DynamoDB state backend setup
│   ├── modules/
│   │   ├── app/           # Core module: Lambda, API GW, CloudFront, S3, DynamoDB, SES, ACM
│   │   └── oidc/          # GitHub Actions OIDC IAM role
│   └── environments/
│       ├── dev/
│       ├── stg/
│       └── prod/
│
├── .github/workflows/
│   ├── ci.yml             # PR gate — all checks must pass
│   ├── deploy-dev.yml
│   ├── deploy-stg.yml
│   ├── deploy-prod.yml    # Requires manual approval
│   └── security.yml       # Weekly scheduled security scan
│
├── ci.sh                  # Local CI runner (mirrors ci.yml)
└── deploy.sh              # Local deploy script
```

---

## Environment Variables

The Lambda function reads the following environment variables (injected by Terraform):

| Variable | Purpose |
|---|---|
| `USERS_TABLE` | DynamoDB table for user accounts |
| `OTP_TABLE` | DynamoDB table for OTP codes |
| `LESSONS_TABLE` | DynamoDB table for dictation lessons |
| `PROGRESS_TABLE` | DynamoDB table for per-user progress |
| `SESSIONS_TABLE` | DynamoDB table for login sessions |
| `CONFIG_TABLE` | DynamoDB table for site configuration |
| `AUDIO_BUCKET` | S3 bucket name for audio files |
| `FROM_EMAIL` | SES verified sender address |
| `ADMIN_EMAILS` | Comma-separated list of admin email addresses |
| `JWT_SECRET` | Secret key for signing JWTs |

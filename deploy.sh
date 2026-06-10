#!/usr/bin/env bash
# Usage: bash deploy.sh [environment]   (default: prod)
set -euo pipefail

ENV="${1:-dev}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TF_DIR="$ROOT/terraform/environments/$ENV"

if [[ ! -d "$TF_DIR" ]]; then
  echo "Unknown environment: $ENV  (expected dev | stg | prod)"
  exit 1
fi

echo "=== 1. Building backend ==="
cd "$ROOT/backend" && bash build.sh

echo "=== 2. Terraform apply ($ENV) ==="
cd "$TF_DIR"
terraform init
terraform apply -auto-approve -var-file=terraform.tfvars

echo "=== 3. Building frontend ==="
cd "$ROOT/frontend"
npm ci
VITE_API_URL="/api" npm run build

BUCKET=$(cd "$TF_DIR" && terraform output -raw frontend_bucket)
CF_ID=$(cd "$TF_DIR" && terraform output -raw cloudfront_distribution_id)

echo "=== 4. Uploading frontend to S3 ==="
aws s3 sync "$ROOT/frontend/dist/" "s3://$BUCKET/" \
  --delete \
  --cache-control "public,max-age=31536000,immutable" \
  --exclude "index.html"
aws s3 cp "$ROOT/frontend/dist/index.html" "s3://$BUCKET/index.html" \
  --cache-control "no-cache,no-store,must-revalidate"

echo "=== 5. Invalidating CloudFront cache ==="
aws cloudfront create-invalidation --distribution-id "$CF_ID" --paths "/*" > /dev/null

echo ""
echo "Deploy complete!"
cd "$TF_DIR" && echo "  Site: $(terraform output -raw site_url)"

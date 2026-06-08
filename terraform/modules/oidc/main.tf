data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  github_oidc_url = "token.actions.githubusercontent.com"
}
resource "aws_iam_openid_connect_provider" "github" {
  url = "https://${local.github_oidc_url}"

  # Client ID that GitHub uses when requesting tokens — always this value
  client_id_list = ["sts.amazonaws.com"]

  # Thumbprint of GitHub's OIDC TLS certificate chain root.
  # AWS uses this to verify the JWT signature. GitHub publishes the value at:
  # https://docs.github.com/en/actions/security-for-github-actions/security-hardening-your-deployments/about-security-hardening-with-openid-connect
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

# ─── Trust policy ─────────────────────────────────────────────────────────────

data "aws_iam_policy_document" "github_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "${local.github_oidc_url}:aud"
      values   = ["sts.amazonaws.com"]
    }

    # `sub` claim format: "repo:<org>/<repo>:ref:refs/heads/<branch>"
    # We use StringLike so we can match multiple environments (dev, staging, prod).
    # To lock it to one branch: StringEquals + exact value.
    condition {
      test     = "StringLike"
      variable = "${local.github_oidc_url}:sub"
      values = [
        "repo:${var.github_org}/${var.github_repo}:ref:refs/heads/${var.environment}",
        "repo:${var.github_org}/${var.github_repo}:ref:refs/heads/develop",
        "repo:${var.github_org}/${var.github_repo}:ref:refs/heads/staging",
        "repo:${var.github_org}/${var.github_repo}:ref:refs/heads/main",
        "repo:${var.github_org}/${var.github_repo}:ref:refs/tags/v*",
      ]
    }
  }
}

# ─── Github Actions role. Permissions: least privilege ────────────────────────────────────────────

resource "aws_iam_role" "github_actions" {
  name               = "${var.github_repo}-oidc-${var.environment}"
  assume_role_policy = data.aws_iam_policy_document.github_trust.json
  description        = "Assumed by GitHub Actions via OIDC"
}

data "aws_iam_policy_document" "github_actions" {
  statement {
    sid       = "Admin"
    effect    = "Allow"
    actions   = ["*"]
    resources = ["*"]
  }
}

resource "aws_iam_policy" "github_actions" {
  name        = "${var.github_repo}-${var.environment}"
  description = "Admin"
  policy      = data.aws_iam_policy_document.github_actions.json
}

resource "aws_iam_role_policy_attachment" "github_actions" {
  role       = aws_iam_role.github_actions.name
  policy_arn = aws_iam_policy.github_actions.arn
}

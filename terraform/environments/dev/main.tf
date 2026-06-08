terraform {
  required_version = ">= 1.14"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
    null = {
      source  = "hashicorp/null"
      version = "~> 3.0"
    }
  }

  backend "s3" {
    bucket       = "devops-learning-tfstate-897722711000" # replace with your bucket name
    key          = "dictation/dev/terraform.tfstate"
    region       = "ap-southeast-1"
    use_lockfile = true
    encrypt      = true # server-side encryption at rest; state may contain sensitive values
  }
}

provider "aws" {
  region = var.aws_region
  default_tags {
    tags = {
      Project     = "dictation"
      Environment = "dev"
      ManagedBy   = "terraform"
    }
  }
}

provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}

provider "cloudflare" {
  # Reads CLOUDFLARE_API_TOKEN from environment — do not set api_token here
}

module "app" {
  source = "../../modules/app"

  providers = {
    aws           = aws
    aws.us_east_1 = aws.us_east_1
    cloudflare    = cloudflare
    null          = null
  }

  environment        = var.environment
  aws_region         = var.aws_region
  domain             = var.domain
  cloudflare_zone_id = var.cloudflare_zone_id
  from_email         = var.from_email
  admin_emails       = var.admin_emails
  lambda_memory_size = 256
  log_retention_days = 7
}

module "oidc" {
  source = "../../modules/oidc"

  environment = var.environment
  github_org  = var.github_org
  github_repo = var.github_repo
}

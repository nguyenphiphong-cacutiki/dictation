terraform {
  required_version = ">= 1.5"
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
    bucket         = "devops-learning-tfstate-897722711000"   # replace with your bucket name
    key            = "dictation/stg/terraform.tfstate"
    region         = "ap-southeast-1"
    use_lockfile = true
    encrypt        = true   # server-side encryption at rest; state may contain sensitive values
  }
}

provider "aws" {
  region = var.aws_region
  default_tags {
    tags = {
      Project     = "dictation"
      Environment = "stg"
      ManagedBy   = "terraform"
    }
  }
}

provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}

provider "cloudflare" {}

module "app" {
  source = "../../modules/app"

  providers = {
    aws           = aws
    aws.us_east_1 = aws.us_east_1
    cloudflare    = cloudflare
    null          = null
  }

  environment        = "stg"
  aws_region         = var.aws_region
  domain             = var.domain
  cloudflare_zone_id = var.cloudflare_zone_id
  from_email         = var.from_email
  admin_emails       = var.admin_emails
  lambda_memory_size = 256
  log_retention_days = 14
}

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
      # acm.tf uses aws.us_east_1 — calling environment must pass this alias
      configuration_aliases = [aws.us_east_1]
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
}

locals {
  # Used as a prefix for all resource names to keep dev/stg/prod isolated
  name_prefix = "${var.project}-${var.environment}"
}

data "aws_caller_identity" "current" {}

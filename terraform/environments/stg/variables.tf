variable "aws_region" {
  default = "ap-southeast-1"
}

variable "domain" {
  description = "Stg environment domain"
  default     = "stg.dictation.uetstudio.com"
}

variable "cloudflare_zone_id" {
  description = "Cloudflare Zone ID for uetstudio.com"
  sensitive   = true
}

variable "from_email" {
  description = "Verified SES sender address"
  sensitive   = true
}

variable "admin_emails" {
  description = "Comma-separated admin email addresses"
  sensitive   = true
}

variable "environment" {
  description = "Environment"
  type        = string
  default     = "stg"
}

variable "github_org" {
  description = "github's usernmae"
  type        = string
}

variable "github_repo" {
  description = "github repo"
  type        = string
}

variable "openai_model" {
  description = "OpenAI model used for AI translations"
  type        = string
  default     = "gpt-4o-mini"
}


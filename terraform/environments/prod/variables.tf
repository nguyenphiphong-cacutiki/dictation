variable "aws_region" {
  default = "ap-southeast-1"
}

variable "domain" {
  description = "Prod environment domain"
  default     = "dailydictation.uetstudio.com"
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

variable "extra_verified_emails" {
  description = "Recipient addresses to verify in SES (required while the account is in sandbox mode)"
  type        = list(string)
  default     = []
}

variable "environment" {
  description = "Environment"
  type        = string
  default     = "prod"
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


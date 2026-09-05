variable "project" {
  description = "Project name, used as a resource name prefix"
  type        = string
  default     = "dictation"
}

variable "environment" {
  description = "Deployment environment: dev, stg, or prod"
  type        = string
}

variable "aws_region" {
  description = "Primary AWS region"
  type        = string
  default     = "ap-southeast-1"
}

variable "domain" {
  description = "Full domain for this environment, e.g. dailydictation.uetstudio.com"
  type        = string
}

variable "cloudflare_zone_id" {
  description = "Cloudflare Zone ID for the root domain (uetstudio.com)"
  type        = string
}

variable "from_email" {
  description = "SES verified sender address"
  type        = string
}

variable "extra_verified_emails" {
  description = "Additional email addresses to verify in SES. While the account is in sandbox mode, every OTP recipient must be listed here (each address receives a verification link to click)."
  type        = list(string)
  default     = []
}

variable "admin_emails" {
  description = "Comma-separated admin email addresses"
  type        = string
}

variable "lambda_memory_size" {
  description = "Lambda memory in MB"
  type        = number
  default     = 256
}

variable "openai_model" {
  description = "OpenAI model used for AI translations"
  type        = string
  default     = "gpt-4o-mini"
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days"
  type        = number
  default     = 14
}

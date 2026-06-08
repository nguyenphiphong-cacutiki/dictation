output "site_url" { value = module.app.site_url }
output "cloudfront_domain" { value = module.app.cloudfront_domain }
output "cloudfront_distribution_id" { value = module.app.cloudfront_distribution_id }
output "frontend_bucket" { value = module.app.frontend_bucket }
output "audio_bucket" { value = module.app.audio_bucket }
output "api_endpoint" { value = module.app.api_endpoint }
output "github_actions_role_arn" { value = module.oidc.github_actions_role_arn }

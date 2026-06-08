output "site_url" {
  value = "https://${var.domain}"
}

output "cloudfront_domain" {
  value = aws_cloudfront_distribution.main.domain_name
}

output "cloudfront_distribution_id" {
  value = aws_cloudfront_distribution.main.id
}

output "api_endpoint" {
  value = aws_apigatewayv2_api.main.api_endpoint
}

output "frontend_bucket" {
  value = aws_s3_bucket.frontend.bucket
}

output "audio_bucket" {
  value = aws_s3_bucket.audio.bucket
}

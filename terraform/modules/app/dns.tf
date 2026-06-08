resource "cloudflare_record" "app" {
  zone_id = var.cloudflare_zone_id
  name    = var.domain
  content = aws_cloudfront_distribution.main.domain_name
  type    = "CNAME"
  ttl     = 1
  proxied = false  # Must be false — CloudFront handles TLS termination directly
}

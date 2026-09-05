# After first apply, AWS sends a verification email to var.from_email.
# Click the link before OTP sending will work.
resource "aws_ses_email_identity" "sender" {
  email = var.from_email
}

# SES sandbox only delivers to verified identities, so each test recipient
# must be verified too (and click its verification link). Request SES
# production access to lift this restriction for real users.
resource "aws_ses_email_identity" "recipients" {
  for_each = toset(var.extra_verified_emails)
  email    = each.value
}

# After first apply, AWS sends a verification email to var.from_email.
# Click the link before OTP sending will work.
resource "aws_ses_email_identity" "sender" {
  email = var.from_email
}

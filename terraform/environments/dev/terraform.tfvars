github_org   = "nguyenphiphong-cacutiki"
github_repo  = "dictation"
openai_model = "gpt-5.4-mini-2026-03-17"

# SES sandbox: recipients must be verified before they can receive OTP emails.
# Each address gets a verification email after `terraform apply` — the link must be clicked.
extra_verified_emails = [
  "phongnp201000@gmail.com",
]

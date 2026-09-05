# path.module = terraform/modules/app  →  ../../../backend = the backend/ dir at repo root
locals {
  backend_dir = "${path.module}/../../../backend"
}



resource "aws_lambda_layer_version" "deps" {
  filename            = "${local.backend_dir}/dist/lambda_layer.zip"
  layer_name          = "${local.name_prefix}-deps"
  compatible_runtimes = ["python3.12"]
  source_code_hash    = fileexists("${local.backend_dir}/dist/lambda_layer.zip") ? filebase64sha256("${local.backend_dir}/dist/lambda_layer.zip") : ""
}

locals {
  # SSM parameter names holding secrets. Only the names are passed to the
  # Lambda as env vars — the values are fetched at runtime so they never land
  # in Terraform state or the function's environment configuration.
  jwt_secret_param = "/dictation/${var.environment}/jwt_secret"
  openai_key_param = "/dictation/${var.environment}/openai_api_key"
}

resource "aws_lambda_function" "api" {
  filename         = "${local.backend_dir}/dist/lambda.zip"
  function_name    = "${local.name_prefix}-api"
  role             = aws_iam_role.lambda.arn
  handler          = "handler.handler"
  runtime          = "python3.12"
  timeout          = 30
  memory_size      = var.lambda_memory_size
  source_code_hash = fileexists("${local.backend_dir}/dist/lambda.zip") ? filebase64sha256("${local.backend_dir}/dist/lambda.zip") : ""
  layers           = [aws_lambda_layer_version.deps.arn]

  environment {
    variables = {
      USERS_TABLE          = aws_dynamodb_table.users.name
      OTP_TABLE            = aws_dynamodb_table.otp.name
      LESSONS_TABLE        = aws_dynamodb_table.lessons.name
      PROGRESS_TABLE       = aws_dynamodb_table.progress.name
      SESSIONS_TABLE       = aws_dynamodb_table.sessions.name
      CONFIG_TABLE         = aws_dynamodb_table.config.name
      AUDIO_BUCKET         = aws_s3_bucket.audio.bucket
      FROM_EMAIL           = var.from_email
      ADMIN_EMAILS         = var.admin_emails
      JWT_SECRET_PARAM     = local.jwt_secret_param
      OPENAI_API_KEY_PARAM = local.openai_key_param
      OPENAI_MODEL         = var.openai_model
    }
  }
}

resource "aws_lambda_permission" "api_gateway" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}

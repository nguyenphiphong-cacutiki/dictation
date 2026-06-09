resource "aws_dynamodb_table" "users" {
  name         = "${local.name_prefix}-users"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "email"

  attribute {
    name = "email"
    type = "S"
  }
}

resource "aws_dynamodb_table" "otp" {
  name         = "${local.name_prefix}-otp"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "email"

  attribute {
    name = "email"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }
}

resource "aws_dynamodb_table" "lessons" {
  name         = "${local.name_prefix}-lessons"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "lesson_id"

  attribute {
    name = "lesson_id"
    type = "S"
  }

  attribute {
    name = "owner_id"
    type = "S"
  }

  attribute {
    name = "created_at"
    type = "S"
  }

  global_secondary_index {
    name            = "owner-index"
    hash_key        = "owner_id"
    range_key       = "created_at"
    projection_type = "ALL"
  }
}

resource "aws_dynamodb_table" "progress" {
  name         = "${local.name_prefix}-progress"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "user_id"
  range_key    = "lesson_id"

  attribute {
    name = "user_id"
    type = "S"
  }

  attribute {
    name = "lesson_id"
    type = "S"
  }
}

resource "aws_dynamodb_table" "sessions" {
  name         = "${local.name_prefix}-sessions"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "session_id"

  attribute {
    name = "session_id"
    type = "S"
  }

  attribute {
    name = "user_id"
    type = "S"
  }

  attribute {
    name = "login_at"
    type = "S"
  }

  global_secondary_index {
    name            = "user-index"
    hash_key        = "user_id"
    range_key       = "login_at"
    projection_type = "ALL"
  }
}

resource "aws_dynamodb_table" "config" {
  name         = "${local.name_prefix}-config"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "config_key"

  attribute {
    name = "config_key"
    type = "S"
  }
}

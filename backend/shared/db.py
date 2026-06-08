import os
import boto3

_region = os.environ.get("AWS_REGION", "ap-southeast-1")

USERS_TABLE = os.environ.get("USERS_TABLE", "dictation-users")
OTP_TABLE = os.environ.get("OTP_TABLE", "dictation-otp")
LESSONS_TABLE = os.environ.get("LESSONS_TABLE", "dictation-lessons")
PROGRESS_TABLE = os.environ.get("PROGRESS_TABLE", "dictation-progress")

_resource = None


def ddb():
    global _resource
    if _resource is None:
        _resource = boto3.resource("dynamodb", region_name=_region)
    return _resource


def table(name):
    return ddb().Table(name)

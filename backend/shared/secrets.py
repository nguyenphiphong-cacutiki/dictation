import os

import boto3

_region = os.environ.get("AWS_REGION", "ap-southeast-1")
_ssm = None
_cache = {}


def _client():
    global _ssm
    if _ssm is None:
        _ssm = boto3.client("ssm", region_name=_region)
    return _ssm


def get_secret(param_name):
    """Fetch and decrypt a SecureString SSM parameter, cached per warm container.

    The value is only requested from SSM at runtime, so secrets never appear in
    Terraform state or the Lambda's environment configuration.
    """
    if param_name not in _cache:
        resp = _client().get_parameter(Name=param_name, WithDecryption=True)
        _cache[param_name] = resp["Parameter"]["Value"]
    return _cache[param_name]

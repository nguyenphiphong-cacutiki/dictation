import json
from decimal import Decimal


class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        return super().default(obj)


def ok(data=None, status=200):
    return {
        "statusCode": status,
        "body": json.dumps(data if data is not None else {}, cls=DecimalEncoder),
    }


def fail(message, status=400):
    return {
        "statusCode": status,
        "body": json.dumps({"error": message}),
    }

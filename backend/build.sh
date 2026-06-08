#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST="$SCRIPT_DIR/dist"

rm -rf "$DIST"
mkdir -p "$DIST/layer/python" "$DIST/lambda"

echo "Installing Lambda layer dependencies..."
pip install PyJWT==2.8.0 -t "$DIST/layer/python" --quiet

echo "Packaging Lambda layer..."
cd "$DIST/layer"
zip -r ../lambda_layer.zip python/ > /dev/null
cd "$SCRIPT_DIR"

echo "Packaging Lambda function..."
cp -r handler.py routes shared "$DIST/lambda/"
cd "$DIST/lambda"
zip -r ../lambda.zip . > /dev/null
cd "$SCRIPT_DIR"

echo "Build complete:"
echo "  Layer: $DIST/lambda_layer.zip"
echo "  Lambda: $DIST/lambda.zip"

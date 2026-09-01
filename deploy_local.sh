#!/bin/bash
set -e

echo "Building client..."
cd src/client
npm run build
cd ../..

echo "Starting server (npm run start)..."
npm run start

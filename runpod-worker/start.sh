#!/bin/bash
# RunPod GPU Worker — Start Script
# Run this on the RunPod pod after uploading the worker files.

set -e

echo "📦 Installing dependencies..."
pip install -r requirements.txt

echo "🚀 Starting Documentary GPU Worker..."
python worker.py

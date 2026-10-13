#!/usr/bin/env bash
# Render Build Script for PDF Tool Backend
set -o errexit

echo "===> Upgrading pip..."
pip install --upgrade pip

echo "===> Installing Python dependencies..."
pip install -r requirements.txt

echo "===> Installing Playwright Chromium browser..."
playwright install chromium

echo "===> Build complete!"

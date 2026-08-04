#!/bin/bash
# setup_and_run.sh

echo "Setting up Python backend for PDF Tool..."

# Check if python3.12 is installed
if ! command -v python3.12 &> /dev/null
then
    echo "python3.12 could not be found. Installing via brew..."
    brew install python@3.12
fi

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "Creating virtual environment using python3.12..."
    python3.12 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Install requirements
echo "Installing dependencies (this may take a while)..."
pip install --upgrade pip
pip install -r requirements.txt

# Instructions for system dependencies
echo ""
echo "========================================================="
echo "Note: Some features require external system dependencies:"
echo "1. OCRmyPDF: brew install ocrmypdf tesseract tesseract-lang"
echo "2. LibreOffice: Download from libreoffice.org or brew install --cask libreoffice"
echo "========================================================="
echo ""

# Start the server
echo "Starting FastAPI server on http://localhost:8000..."
uvicorn main:app --reload --port 8000

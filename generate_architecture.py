import os
import re
from pathlib import Path

# Paths
BASE_DIR = Path(r"c:\Users\BVPWSCRAP\pdf-tool")
BACKEND_MAIN = BASE_DIR / "backend" / "main.py"
PAGES_DIR = BASE_DIR / "src" / "pages"
COMPONENTS_DIR = BASE_DIR / "src" / "components"

AGENTS_DIR = BASE_DIR / ".agents" / "rules"
AGENTS_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_FILE = AGENTS_DIR / "architecture.md"

def extract_backend_routes(filepath):
    routes = []
    if not filepath.exists(): return routes
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Regex to find @app.post("/endpoint") or @router.get(...) etc
    pattern = re.compile(r'@(?:app|router)\.(get|post|put|delete)\(["\']([^"\']+)["\']')
    matches = pattern.findall(content)
    for method, path in matches:
        routes.append({"method": method.upper(), "path": path})
    return routes

def scan_frontend_files():
    api_calls = {}
    components = []
    
    def scan_dir(directory):
        for root, dirs, files in os.walk(directory):
            for file in files:
                if file.endswith(('.tsx', '.ts')):
                    path = Path(root) / file
                    with open(path, 'r', encoding='utf-8', errors='ignore') as f:
                        content = f.read()
                        
                        # Find API endpoints being called, look for strings like "/api/..."
                        endpoints = re.findall(r'["\'](/api/[^"\']+)["\']|["\'](http://localhost:8000/[^"\']+)["\']|["\'](/[^"\']+)["\']', content)
                        endpoints = [e[0] or e[1] or e[2] for e in endpoints if any(e)]
                        endpoints = list(set([e for e in endpoints if len(e) > 1 and not e.startswith('/src') and not e.endswith('.tsx')]))
                        
                        if endpoints:
                            api_calls[file] = endpoints
                        
                        components.append(file)
                        
    scan_dir(PAGES_DIR)
    scan_dir(COMPONENTS_DIR)
    
    return api_calls, components

def main():
    routes = extract_backend_routes(BACKEND_MAIN)
    api_calls, frontend_components = scan_frontend_files()
    
    markdown_content = f"""---
trigger: always_on
description: "Automatically provides the codebase graph, folder structure, and API connections for the pdf-tool project to Antigravity."
---

# PDF-Tool Codebase Architecture & Graph

This document serves as the "Graph" context for the `pdf-tool` project, giving AI agents an instant understanding of the project's structure, files, and API connections without needing to scan the whole repository.

## Project Structure Overview

- **`backend/`**: Contains the Python backend (FastAPI/Flask).
  - `main.py`: The core backend file containing all API routes and logic.
  - `requirements.txt`: Python dependencies.
- **`src/`**: Contains the React + TypeScript frontend.
  - **`pages/`**: Contains {len(frontend_components)} page components (e.g., AdvancedEditor.tsx, AllTools.tsx).
  - **`components/`**: Contains shared UI components (e.g., Layout.tsx, FileDropzone.tsx).
- **`public/`**: Static assets.

## Backend Routes Overview

The backend exposes the following API routes found in `backend/main.py`:

```markdown
"""
    for route in sorted(routes, key=lambda x: x['path']):
        markdown_content += f"- [{route['method']}] {route['path']}\n"
        
    markdown_content += """```

## Frontend to Backend Connections

This section maps which frontend components interact with which API endpoints or internal paths:

```markdown
"""
    for comp, calls in sorted(api_calls.items()):
        if any(c in str(routes) for c in calls) or any('/api/' in c for c in calls):
            filtered_calls = [c for c in calls if 'api' in c or 'localhost' in c or c in str(routes)]
            if filtered_calls:
                markdown_content += f"- **{comp}** calls: {', '.join(filtered_calls)}\n"
                
    markdown_content += """```

## How to use this Graph

As an AI agent, you now know the entire project structure. If a user asks to modify a feature, check the Frontend-to-Backend Connections to determine which React component in `src/pages` and which backend route in `backend/main.py` needs to be edited.
"""
    
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        f.write(markdown_content)
        
    print(f"Successfully generated architecture graph at {OUTPUT_FILE}")

if __name__ == "__main__":
    main()

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

/**
 * Enterprise Server-Side Fallback for W3C Web Share Target (`POST /share-target`).
 * If Android OS sends a share POST request before the Service Worker has claimed the client
 * (or if Android Battery Saver paused the Service Worker), this middleware captures the
 * multipart shared files on the server, hydrates them directly into the mobile browser's
 * CacheStorage + IndexedDB, and redirects to `/scan-to-print?from_share=true`.
 */
function pmsShareTargetServerPlugin(): Plugin {
  const handleShareTargetMiddleware = (req: any, res: any, next: () => void) => {
    const reqUrl = String(req.url || '');
    if (!reqUrl.startsWith('/share-target')) {
      return next();
    }

    if (req.method === 'GET') {
      res.statusCode = 303;
      res.setHeader('Location', '/scan-to-print?from_share=true');
      res.end();
      return;
    }

    if (req.method !== 'POST') {
      return next();
    }

    const chunks: Buffer[] = [];
    let totalBytes = 0;
    const MAX_BYTES = 105 * 1024 * 1024; // 105 MB limit

    req.on('data', (chunk: Buffer) => {
      totalBytes += chunk.length;
      if (totalBytes <= MAX_BYTES) {
        chunks.push(chunk);
      }
    });

    req.on('end', async () => {
      try {
        const rawBody = Buffer.concat(chunks);
        const headers: Record<string, string> = {};
        for (const [k, v] of Object.entries(req.headers || {})) {
          if (typeof v === 'string') headers[k] = v;
          else if (Array.isArray(v)) headers[k] = v.join(', ');
        }

        const webReq = new Request(`http://localhost${reqUrl}`, {
          method: 'POST',
          headers,
          body: rawBody,
        });

        const formData = await webReq.formData();
        const extractedFiles: { name: string; type: string; size: number; b64: string }[] = [];

        for (const [, value] of formData.entries()) {
          if (value && typeof value === 'object' && typeof (value as any).arrayBuffer === 'function') {
            const f = value as File;
            const ab = await f.arrayBuffer();
            if (ab && ab.byteLength > 0) {
              extractedFiles.push({
                name: f.name || `Shared_Document_${Date.now()}.pdf`,
                type: f.type || 'application/pdf',
                size: ab.byteLength,
                b64: Buffer.from(ab).toString('base64'),
              });
            }
          }
        }

        const title = String(formData.get('title') || '');
        const text = String(formData.get('text') || '');
        const payloadJson = JSON.stringify({
          files: extractedFiles,
          title,
          text,
          timestamp: Date.now(),
        }).replace(/</g, '\\u003c');

        const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Loading Shared Document…</title>
  <style>
    body { margin: 0; font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; text-align: center; }
    .box { padding: 24px; max-width: 320px; }
    .spinner { width: 42px; height: 42px; border: 4px solid #334155; border-top-color: #e11d48; border-radius: 50%; animation: s 0.7s linear infinite; margin: 0 auto 16px; }
    @keyframes s { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="box">
    <div class="spinner"></div>
    <div style="font-weight:800;font-size:16px;">Preparing Document for Print…</div>
    <div style="font-size:12px;color:#94a3b8;margin-top:6px;">Opening Scan to Print Station</div>
  </div>
  <script>
    (async function() {
      try {
        var data = ${payloadJson};
        var now = data.timestamp || Date.now();
        var materialized = [];
        for (var i = 0; i < (data.files || []).length; i++) {
          var item = data.files[i];
          var binStr = atob(item.b64);
          var bytes = new Uint8Array(binStr.length);
          for (var j = 0; j < binStr.length; j++) bytes[j] = binStr.charCodeAt(j);
          materialized.push({
            name: item.name,
            type: item.type || 'application/pdf',
            size: bytes.byteLength,
            lastModified: now,
            buffer: bytes.buffer
          });
        }
        if (materialized.length > 0) {
          // 1. Write to CacheStorage
          try {
            if (typeof caches !== 'undefined') {
              var cache = await caches.open('pms-share-cache-v2');
              var metaItems = [];
              for (var k = 0; k < materialized.length; k++) {
                var mf = materialized[k];
                await cache.put('/__pms_shared_file__/' + k, new Response(mf.buffer, {
                  status: 200,
                  headers: { 'Content-Type': mf.type, 'Content-Length': String(mf.size) }
                }));
                metaItems.push({ index: k, name: mf.name, type: mf.type, size: mf.size, lastModified: now });
              }
              await cache.put('/__pms_shared_meta__', new Response(JSON.stringify({
                id: 'latest_share',
                title: data.title || '',
                text: data.text || '',
                timestamp: now,
                items: metaItems
              }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
            }
          } catch (e) {}

          // 2. Write to IndexedDB
          try {
            await new Promise(function(resolve) {
              var req = indexedDB.open('pms_share_cache_v1', 1);
              req.onupgradeneeded = function(ev) {
                var db = ev.target.result;
                if (!db.objectStoreNames.contains('shared_records')) {
                  db.createObjectStore('shared_records', { keyPath: 'id' });
                }
              };
              req.onsuccess = function() {
                var db = req.result;
                var tx = db.transaction('shared_records', 'readwrite');
                tx.objectStore('shared_records').put({
                  id: 'latest_share',
                  files: materialized,
                  title: data.title || '',
                  text: data.text || '',
                  timestamp: now
                });
                tx.oncomplete = function() { db.close(); resolve(); };
                tx.onerror = function() { db.close(); resolve(); };
              };
              req.onerror = function() { resolve(); };
            });
          } catch (e) {}
        }
      } catch (err) {
        console.error('Share hydration error:', err);
      }
      window.location.replace('/scan-to-print?from_share=true&share_ts=' + Date.now());
    })();
  </script>
</body>
</html>`;

        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.end(html);
      } catch (err) {
        console.error('[ShareTarget Server Fallback] Error:', err);
        res.statusCode = 303;
        res.setHeader('Location', '/scan-to-print?from_share=true');
        res.end();
      }
    });
  };

  return {
    name: 'pms-share-target-server',
    configureServer(server) {
      server.middlewares.use(handleShareTargetMiddleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handleShareTargetMiddleware);
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [
      pmsShareTargetServerPlugin(),
      react(),
      tailwindcss(),
      nodePolyfills({
        include: ['crypto', 'buffer', 'stream', 'vm', 'http', 'https', 'url', 'assert'],
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
    },
    // Render sends a real Host header; Vite 6 preview blocks unknown hosts unless listed here.
    preview: {
      host: '0.0.0.0',
      allowedHosts: [
        'pdf-tool-adv.onrender.com',
        'mediasuite.onrender.com',
        'pdfmediasuite.in',
        'www.pdfmediasuite.in',
        'localhost',
        '127.0.0.1',
      ],
      // Content-Security-Policy via HTTP headers (stronger than <meta> tag).
      // Mirrors the policy in index.html; keep both in sync.
      headers: {
        'Content-Security-Policy': [
          "default-src 'self'",
          "script-src  'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob: https://cdn.jsdelivr.net https://pdfmediasuite.in https://www.pdfmediasuite.in",
          "style-src   'self' 'unsafe-inline' https://fonts.googleapis.com",
          "font-src    'self' https://fonts.gstatic.com data:",
          "img-src     'self' data: blob: https:",
          "media-src   'self' blob:",
          "connect-src 'self' wss: https://*.peerjs.com wss://*.peerjs.com https://api.qrserver.com https://*.onrender.com https://pdfmediasuite.in https://www.pdfmediasuite.in https://generativelanguage.googleapis.com https://cdn.jsdelivr.net https://tessdata.projectnaptha.com https://staticimgly.com https://tfhub.dev https://storage.googleapis.com http://localhost:8000 http://127.0.0.1:8000",
          "worker-src  'self' blob: https://cdn.jsdelivr.net https://pdfmediasuite.in https://www.pdfmediasuite.in",
          "object-src  'none'",
          "frame-src   'none'",
          "base-uri    'self'",
          "form-action 'self'",
        ].join('; '),
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
      },
    },
  };
});

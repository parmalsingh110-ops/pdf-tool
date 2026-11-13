import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import crypto from 'crypto';
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
  // Built-in local print-drop relay so localhost:3000 works even when Python port 8000 is not running
  const localPrintRooms = new Map<string, any[]>();
  const localPrintFiles = new Map<string, { buffer: Buffer; mime: string; createdAt: number }>();
  const localRoomTokens = new Map<string, number>();
  const localDeviceTokens = new Map<string, Map<string, number>>();
  const localRoomSecrets = new Map<string, string>();
  const localRoomTimestamps = new Map<string, number>();

  const hashToken = (tok: string) =>
    crypto.createHash('sha256').update(tok.trim()).digest('hex');

  const safeEqualHex = (a: string, b: string) => {
    if (!a || !b || a.length !== b.length) return false;
    return crypto.timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
  };

  const extractRoomToken = (req: any): string => {
    const hdr = req.headers?.['x-room-token'];
    if (typeof hdr === 'string' && hdr.trim()) return hdr.trim();
    const auth = req.headers?.['authorization'];
    if (typeof auth === 'string' && auth.startsWith('Bearer ')) return auth.slice(7).trim();
    return '';
  };

  const pruneLocalRelay = () => {
    const now = Date.now();
    for (const [key, item] of localPrintFiles.entries()) {
      if (now - item.createdAt > 15 * 60 * 1000) {
        localPrintFiles.delete(key);
      }
    }
    for (const [room, ts] of localRoomTimestamps.entries()) {
      if (now - ts > 20 * 60 * 1000) {
        localRoomTimestamps.delete(room);
        localPrintRooms.delete(room);
        localRoomTokens.delete(room);
        localDeviceTokens.delete(room);
        localRoomSecrets.delete(room);
      }
    }
  };

  const sweepTimer = setInterval(pruneLocalRelay, 60 * 1000);
  if (typeof sweepTimer.unref === 'function') sweepTimer.unref();

  const handleShareTargetMiddleware = (req: any, res: any, next: () => void) => {
    const reqUrl = String(req.url || '');

    if (reqUrl.startsWith('/api/print-drop/register') && req.method === 'POST') {
      pruneLocalRelay();
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', async () => {
        try {
          const rawBody = Buffer.concat(chunks);
          const headers: Record<string, string> = {};
          for (const [k, v] of Object.entries(req.headers || {})) {
            if (typeof v === 'string') headers[k] = v;
            else if (Array.isArray(v)) headers[k] = v.join(', ');
          }
          const webReq = new Request(`http://localhost${reqUrl}`, { method: 'POST', headers, body: rawBody });
          const formData = await webReq.formData();
          const cleanSession = String(formData.get('session_id') || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
          const token = String(formData.get('read_token') || extractRoomToken(req) || '').trim();
          if (cleanSession.length < 3 || cleanSession.length > 12 || cleanSession === 'KIOSKSTATION' || cleanSession === 'AUDIONOTES' || token.length < 16) {
            res.statusCode = 400;
            res.end(JSON.stringify({ detail: 'Invalid room PIN or secret token' }));
            return;
          }
          const h = hashToken(token);
          const existing = localRoomSecrets.get(cleanSession);
          if (existing) {
            if (!safeEqualHex(h, existing)) {
              res.statusCode = 409;
              res.end(JSON.stringify({ detail: 'Room PIN already claimed' }));
              return;
            }
            localRoomTimestamps.set(cleanSession, Date.now());
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true, session_id: cleanSession }));
            return;
          }
          if ((localPrintRooms.get(cleanSession) || []).length > 0) {
            res.statusCode = 409;
            res.end(JSON.stringify({ detail: 'Room already active' }));
            return;
          }
          localRoomSecrets.set(cleanSession, h);
          localRoomTimestamps.set(cleanSession, Date.now());
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: true, session_id: cleanSession }));
        } catch {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: 'Relay register error' }));
        }
      });
      return;
    }

    // ── Built-in Print-Drop Relay Endpoints (/api/print-drop/*) ──────────
    if (reqUrl.startsWith('/api/print-drop/jobs/') && req.method === 'GET') {
      pruneLocalRelay();
      const sessionRaw = reqUrl.split('/api/print-drop/jobs/')[1]?.split('?')[0] || '';
      const cleanSession = sessionRaw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      const expected = localRoomSecrets.get(cleanSession);
      if (!expected) {
        res.statusCode = 412;
        res.end(JSON.stringify({ detail: 'Room not registered' }));
        return;
      }
      const provided = extractRoomToken(req);
      if (!provided || !safeEqualHex(hashToken(provided), expected)) {
        res.statusCode = 403;
        res.end(JSON.stringify({ detail: 'Unauthorized' }));
        return;
      }
      const jobs = localPrintRooms.get(cleanSession) || [];
      localPrintRooms.delete(cleanSession);
      localRoomTimestamps.set(cleanSession, Date.now());
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true, jobs }));
      return;
    }

    if (reqUrl.startsWith('/api/print-drop/file/') && req.method === 'GET') {
      pruneLocalRelay();
      const [pathPart, queryPart = ''] = reqUrl.split('/api/print-drop/file/')[1]?.split('?') || ['', ''];
      const parts = pathPart.split('/');
      const cleanSession = (parts[0] || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      const expected = localRoomSecrets.get(cleanSession);
      const provided = extractRoomToken(req);
      if (!expected || !provided || !safeEqualHex(hashToken(provided), expected)) {
        res.statusCode = 403;
        res.end('Unauthorized');
        return;
      }
      const key = `${cleanSession}_${parts[1] || ''}`;
      const stored = localPrintFiles.get(key);
      const keepAudio = cleanSession.startsWith('TN') && queryPart.includes('keep=1');
      if (!keepAudio) {
        localPrintFiles.delete(key);
      }
      if (!stored) {
        res.statusCode = 404;
        res.end('Not found');
        return;
      }
      res.statusCode = 200;
      res.setHeader('Content-Type', stored.mime || 'application/octet-stream');
      res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
      res.end(stored.buffer);
      return;
    }

    if (reqUrl.startsWith('/api/print-drop/upload') && req.method === 'POST') {
      pruneLocalRelay();
      const chunks: Buffer[] = [];
      let totalReceived = 0;
      let tooLarge = false;
      req.on('data', (c: Buffer) => {
        if (tooLarge) return;
        totalReceived += c.byteLength;
        if (totalReceived > 105 * 1024 * 1024) {
          tooLarge = true;
          chunks.length = 0;
          try {
            res.statusCode = 413;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'File too large (max 100MB)' }));
          } catch {}
          try { req.destroy(); } catch {}
          return;
        }
        chunks.push(c);
      });
      req.on('end', async () => {
        if (tooLarge) {
          return;
        }
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
          const sessionRaw = String(formData.get('session_id') || '');
          const cleanSession = sessionRaw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
          const fileEntry = formData.get('file') as File | null;
          if (cleanSession.length < 3 || cleanSession.length > 12 || cleanSession === 'KIOSKSTATION' || cleanSession === 'AUDIONOTES' || !fileEntry || typeof fileEntry.arrayBuffer !== 'function') {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Invalid upload' }));
            return;
          }
          if (!localRoomSecrets.has(cleanSession)) {
            res.statusCode = 404;
            res.end(JSON.stringify({ error: 'Counter station PIN is inactive. Keep Scan-to-Print open on the receiver PC.' }));
            return;
          }
          if (localPrintRooms.size >= 500 && !localPrintRooms.has(cleanSession)) {
            res.statusCode = 429;
            res.end(JSON.stringify({ error: 'Local relay capacity reached.' }));
            return;
          }
          const currentQueue = localPrintRooms.get(cleanSession) || [];
          if (currentQueue.length >= 30) {
            res.statusCode = 429;
            res.end(JSON.stringify({ error: 'Counter queue is full (30 pending files).' }));
            return;
          }
          const ab = await fileEntry.arrayBuffer();
          const buf = Buffer.from(ab);
          const rawJobId = String(formData.get('job_id') || `job_${Date.now()}`);
          const jobId = rawJobId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || `job_${Date.now()}`;
          const copies = Math.max(1, Math.min(20, Number(formData.get('copies') || 1) || 1));
          const colorMode = String(formData.get('color_mode') || 'bw') === 'color' ? 'color' : 'bw';
          const senderDeviceId = String(formData.get('sender_device_id') || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48);
          const deviceLabel = String(formData.get('device_label') || 'Sender Device').replace(/[\x00-\x1f\x7f<>]/g, '').trim().slice(0, 32) || 'Sender Device';
          const safeFileName = path.basename(String(fileEntry.name || 'Document.pdf')).replace(/[^\w.\-]/g, '_').slice(0, 180) || 'Document.pdf';

          if (!localDeviceTokens.has(cleanSession)) {
            localDeviceTokens.set(cleanSession, new Map());
          }
          const devMap = localDeviceTokens.get(cleanSession)!;
          let tokenNum = 1;
          if (senderDeviceId && devMap.has(senderDeviceId)) {
            tokenNum = devMap.get(senderDeviceId)!;
          } else {
            tokenNum = (localRoomTokens.get(cleanSession) || 0) + 1;
            localRoomTokens.set(cleanSession, tokenNum);
            if (senderDeviceId) devMap.set(senderDeviceId, tokenNum);
          }

          localPrintFiles.set(`${cleanSession}_${jobId}`, {
            buffer: buf,
            mime: fileEntry.type || 'application/pdf',
            createdAt: Date.now(),
          });
          localRoomTimestamps.set(cleanSession, Date.now());

          const job = {
            id: jobId,
            tokenNum,
            senderDeviceId,
            deviceLabel,
            name: safeFileName,
            size: buf.byteLength,
            type: fileEntry.type || 'application/pdf',
            fileUrl: `/api/print-drop/file/${cleanSession}/${jobId}`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            copies,
            colorMode,
          };

          const existing = localPrintRooms.get(cleanSession) || [];
          existing.push(job);
          localPrintRooms.set(cleanSession, existing);

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: true, job_id: jobId, token_num: tokenNum, session_id: cleanSession }));
        } catch (e) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: 'Relay error' }));
        }
      });
      return;
    }

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
    build: {
      target: 'es2022',
    },
    optimizeDeps: {
      exclude: ['harfbuzzjs'],
      esbuildOptions: {
        target: 'es2022',
      },
    },
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
          "connect-src 'self' blob: data: wss: https://*.peerjs.com wss://*.peerjs.com https://*.onrender.com https://pdfmediasuite.in https://www.pdfmediasuite.in https://generativelanguage.googleapis.com https://cdn.jsdelivr.net https://unpkg.com https://tessdata.projectnaptha.com https://staticimgly.com https://tfhub.dev https://storage.googleapis.com http://localhost:8000 http://127.0.0.1:8000",
          "worker-src  'self' blob: https://cdn.jsdelivr.net https://pdfmediasuite.in https://www.pdfmediasuite.in",
          "object-src  'none'",
          "frame-src   'self' blob: data:",
          "base-uri    'self'",
          "form-action 'self'",
        ].join('; '),
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Permissions-Policy': 'camera=(self), microphone=(self), geolocation=()',
      },
    },
  };
});

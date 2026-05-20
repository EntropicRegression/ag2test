import { app, BrowserWindow } from 'electron';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let server;
let port;
let mainWindow;

// 1. Embedded lightweight static file server using Node.js standard libraries
function startStaticServer() {
  return new Promise((resolve, reject) => {
    server = http.createServer((req, res) => {
      // Decode URL to support spaces and special characters in paths
      let safePath = decodeURIComponent(req.url.split('?')[0]);
      if (safePath === '/' || safePath === '') {
        safePath = '/index.html';
      }

      const filePath = path.join(__dirname, safePath);

      // Directory traversal defense: restrict path to inside __dirname
      const relative = path.relative(__dirname, filePath);
      const isSafe = relative && !relative.startsWith('..') && !path.isAbsolute(relative);
      
      // index.html itself is at relative = "" or "index.html". Let's verify correctly:
      if (filePath !== __dirname && relative.startsWith('..')) {
        res.statusCode = 403;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end('Forbidden: Access Denied');
        return;
      }

      fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.end('404: File Not Found');
          return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const mimeTypes = {
          '.html': 'text/html; charset=utf-8',
          '.css': 'text/css; charset=utf-8',
          '.js': 'application/javascript; charset=utf-8',
          '.json': 'application/json; charset=utf-8',
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.gif': 'image/gif',
          '.svg': 'image/svg+xml',
          '.ico': 'image/x-icon',
          '.gltf': 'model/gltf+json',
          '.glb': 'model/gltf-binary',
          '.obj': 'text/plain; charset=utf-8',
          '.fbx': 'application/octet-stream'
        };

        const contentType = mimeTypes[ext] || 'application/octet-stream';
        res.statusCode = 200;
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'no-cache'); // bypass aggressive cache for live edits

        // Stream static files using standard fs streams
        const stream = fs.createReadStream(filePath);
        stream.on('error', (streamErr) => {
          console.error(streamErr);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.end('500: Internal Server Error');
          }
        });
        stream.pipe(res);
      });
    });

    // Listen on port 0 on 127.0.0.1 for maximum local security and dynamic port allocation
    server.listen(0, '127.0.0.1', () => {
      port = server.address().port;
      console.log(`[Embedded Static Server] Running at http://127.0.0.1:${port}`);
      resolve(port);
    });

    server.on('error', (err) => {
      reject(err);
    });
  });
}

function createWindow(localPort) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    title: 'NeoWire 3D - 3D 線框模型編輯器',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true // strictly enforce security
    }
  });

  // Hide the default application top menu bar
  mainWindow.setMenuBarVisibility(false);

  // Load standard URL from our internal static server
  mainWindow.loadURL(`http://127.0.0.1:${localPort}/index.html`);

  // Forward all renderer console messages to main process terminal for seamless diagnostics
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[Renderer Console] [Level ${level}] ${message} (at ${sourceId}:${line})`);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 2. Lifecycle management
app.whenReady().then(async () => {
  try {
    const localPort = await startStaticServer();
    createWindow(localPort);

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow(localPort);
      }
    });
  } catch (err) {
    console.error('Failed to initialize local static server:', err);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  if (server) {
    server.close();
    console.log('[Embedded Static Server] Gracefully Stopped.');
  }
});

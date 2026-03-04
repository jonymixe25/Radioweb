import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";
import fs from "fs";
import multer from "multer";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("radio.db");

// Initialize DB
db.exec(`
  CREATE TABLE IF NOT EXISTS songs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    artist TEXT,
    filename TEXT,
    duration INTEGER,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    song_name TEXT,
    listener_name TEXT,
    message TEXT,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + "-" + file.originalname);
  },
});

const upload = multer({ storage });

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer });
  const PORT = 3000;

  let liveBroadcaster: WebSocket | null = null;

  wss.on("connection", (ws) => {
    console.log("Nueva conexión WebSocket");

    ws.on("message", (data, isBinary) => {
      if (isBinary) {
        if (liveBroadcaster === ws) {
          wss.clients.forEach((client) => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
              client.send(data, { binary: true });
            }
          });
        }
      } else {
        try {
          const message = JSON.parse(data.toString());
          if (message.type === "START_LIVE") {
            liveBroadcaster = ws;
            wss.clients.forEach((client) => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ type: "LIVE_STATUS", active: true }));
              }
            });
          } else if (message.type === "STOP_LIVE") {
            if (liveBroadcaster === ws) {
              liveBroadcaster = null;
              wss.clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                  client.send(JSON.stringify({ type: "LIVE_STATUS", active: false }));
                }
              });
            }
          } else if (message.type === "GET_STATUS") {
            ws.send(JSON.stringify({ type: "LIVE_STATUS", active: !!liveBroadcaster }));
          }
        } catch (e) {
          console.error("Error parsing WS message", e);
        }
      }
    });

    ws.on("close", () => {
      if (liveBroadcaster === ws) {
        liveBroadcaster = null;
        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: "LIVE_STATUS", active: false }));
          }
        });
      }
    });
  });

  app.use(express.json());
  app.use("/uploads", express.static(uploadsDir));

  // API Routes
  app.get("/api/songs", (req, res) => {
    const songs = db.prepare("SELECT * FROM songs ORDER BY added_at DESC").all();
    res.json(songs);
  });

  app.get("/api/requests", (req, res) => {
    const requests = db.prepare("SELECT * FROM requests ORDER BY created_at DESC").all();
    res.json(requests);
  });

  app.post("/api/requests", (req, res) => {
    const { song_name, listener_name, message } = req.body;
    if (!song_name) return res.status(400).json({ error: "El nombre de la canción es obligatorio" });

    const stmt = db.prepare("INSERT INTO requests (song_name, listener_name, message) VALUES (?, ?, ?)");
    stmt.run(song_name, listener_name || "Anónimo", message || "");
    res.json({ success: true });
  });

  app.delete("/api/requests/:id", (req, res) => {
    db.prepare("DELETE FROM requests WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // Settings API
  app.get("/api/settings", (req, res) => {
    const settings = db.prepare("SELECT * FROM settings").all();
    const settingsObj = settings.reduce((acc, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {});
    res.json(settingsObj);
  });

  app.post("/api/settings", (req, res) => {
    const { name, slogan } = req.body;
    const upsert = db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
    if (name) upsert.run("name", name);
    if (slogan) upsert.run("slogan", slogan);
    res.json({ success: true });
  });

  // Song Update API
  app.put("/api/songs/:id", (req, res) => {
    const { title, artist } = req.body;
    db.prepare("UPDATE songs SET title = ?, artist = ? WHERE id = ?").run(title, artist, req.params.id);
    res.json({ success: true });
  });

  app.get("/api/stats", (req, res) => {
    const songCount = db.prepare("SELECT COUNT(*) as count FROM songs").get().count;
    const requestCount = db.prepare("SELECT COUNT(*) as count FROM requests").get().count;
    res.json({ songCount, requestCount, listeners: Math.floor(Math.random() * 500) + 1000 });
  });

  app.post("/api/songs/import", async (req, res) => {
    const { title, artist, download_url } = req.body;
    
    if (!download_url) {
      return res.status(400).json({ success: false, error: "No se proporcionó URL de descarga" });
    }

    try {
      const response = await fetch(download_url);
      if (!response.ok) throw new Error(`Error al descargar: ${response.statusText}`);
      
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      // Generar nombre de archivo único
      const ext = download_url.split('.').pop()?.split('?')[0] || 'mp3';
      const filename = `${Date.now()}-${Math.round(Math.random() * 1E9)}.${ext}`;
      const filePath = path.join(__dirname, "public", "uploads", filename);
      
      // Guardar archivo
      fs.writeFileSync(filePath, buffer);
      
      // Insertar en DB
      const result = db.prepare("INSERT INTO songs (title, artist, filename) VALUES (?, ?, ?)").run(title, artist, filename);
      res.json({ success: true, id: result.lastInsertRowid });
    } catch (err: any) {
      console.error("Error en importación real:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post("/api/songs/upload", upload.single("audio"), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No se subió ningún archivo" });

    const { title, artist } = req.body;
    const filename = req.file.filename;

    const stmt = db.prepare("INSERT INTO songs (title, artist, filename) VALUES (?, ?, ?)");
    const info = stmt.run(title || "Sin título", artist || "Artista desconocido", filename);

    res.json({ id: info.lastInsertRowid, title, artist, filename });
  });

  app.delete("/api/songs/:id", (req, res) => {
    const song = db.prepare("SELECT filename FROM songs WHERE id = ?").get(req.params.id);
    if (song) {
      const filePath = path.join(uploadsDir, song.filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      db.prepare("DELETE FROM songs WHERE id = ?").run(req.params.id);
    }
    res.json({ success: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor de Radio Estelar ejecutándose en http://localhost:${PORT}`);
  });
}

startServer();

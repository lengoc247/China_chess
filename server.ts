import express from "express";
import { createServer as createViteServer } from "vite";
import { createServer } from "http";
import { Server } from "socket.io";
import Database from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";
import path from "path";

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
  },
});

app.use(express.json());

// Database setup
const db = new Database("game.db");
db.pragma("journal_mode = WAL");

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE,
    name TEXT,
    avatar TEXT
  );
  CREATE TABLE IF NOT EXISTS games (
    id TEXT PRIMARY KEY,
    status TEXT,
    board_state TEXT,
    current_turn TEXT,
    player_red_id TEXT,
    player_black_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    game_id TEXT,
    user_id TEXT,
    user_name TEXT,
    content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// OAuth Routes
app.get("/api/auth/url", (req, res) => {
  const redirectUri = `${process.env.APP_URL}/auth/callback`;
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || "",
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "email profile",
    access_type: "offline",
    prompt: "consent",
  });
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  res.json({ url: authUrl });
});

app.get("/auth/callback", async (req, res) => {
  const { code } = req.query;
  const redirectUri = `${process.env.APP_URL}/auth/callback`;

  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: code as string,
        client_id: process.env.GOOGLE_CLIENT_ID || "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok) throw new Error(tokenData.error_description || "Failed to get token");

    const userResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userData = await userResponse.json();

    // Upsert user
    const stmt = db.prepare(`
      INSERT INTO users (id, email, name, avatar) 
      VALUES (?, ?, ?, ?) 
      ON CONFLICT(email) DO UPDATE SET name=excluded.name, avatar=excluded.avatar
    `);
    stmt.run(userData.id, userData.email, userData.name, userData.picture);

    const userPayload = JSON.stringify({
      id: userData.id,
      email: userData.email,
      name: userData.name,
      avatar: userData.picture,
    });

    res.send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', user: ${userPayload} }, '*');
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
          <p>Authentication successful. This window should close automatically.</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("OAuth error:", error);
    res.status(500).send("Authentication failed");
  }
});

// Game API
app.post("/api/games", (req, res) => {
  const { userId } = req.body;
  const gameId = uuidv4();
  const initialBoard = generateInitialBoard();
  
  const stmt = db.prepare(`
    INSERT INTO games (id, status, board_state, current_turn, player_red_id)
    VALUES (?, 'waiting', ?, 'red', ?)
  `);
  stmt.run(gameId, JSON.stringify(initialBoard), userId);
  
  res.json({ id: gameId });
});

app.get("/api/games", (req, res) => {
  const games = db.prepare("SELECT * FROM games ORDER BY created_at DESC LIMIT 20").all();
  res.json(games);
});

app.get("/api/games/:id", (req, res) => {
  const game = db.prepare("SELECT * FROM games WHERE id = ?").get(req.params.id);
  if (!game) return res.status(404).json({ error: "Game not found" });
  
  // Parse board state
  game.board_state = JSON.parse(game.board_state);
  res.json(game);
});

app.post("/api/games/:id/join", (req, res) => {
  const { userId } = req.body;
  const gameId = req.params.id;
  
  const game = db.prepare("SELECT * FROM games WHERE id = ?").get(gameId);
  if (!game) return res.status(404).json({ error: "Game not found" });
  
  if (game.status === 'waiting' && game.player_red_id !== userId) {
    db.prepare("UPDATE games SET player_black_id = ?, status = 'playing' WHERE id = ?").run(userId, gameId);
    io.to(gameId).emit("game_started", { player_black_id: userId });
  }
  
  res.json({ success: true });
});

app.get("/api/games/:id/messages", (req, res) => {
  const messages = db.prepare("SELECT * FROM messages WHERE game_id = ? ORDER BY created_at ASC").all(req.params.id);
  res.json(messages);
});

// Socket.IO
io.on("connection", (socket) => {
  socket.on("join_game", (gameId) => {
    socket.join(gameId);
  });

  socket.on("leave_game", (gameId) => {
    socket.leave(gameId);
  });

  socket.on("chat_message", (data) => {
    const { gameId, userId, userName, content } = data;
    const msgId = uuidv4();
    
    db.prepare("INSERT INTO messages (id, game_id, user_id, user_name, content) VALUES (?, ?, ?, ?, ?)")
      .run(msgId, gameId, userId, userName, content);
      
    io.to(gameId).emit("chat_message", { id: msgId, gameId, userId, userName, content, created_at: new Date().toISOString() });
  });

  socket.on("move", (data) => {
    const { gameId, from, to, userId } = data;
    const game = db.prepare("SELECT * FROM games WHERE id = ?").get(gameId);
    if (!game || game.status !== 'playing') return;
    
    // Basic validation: check if it's the user's turn
    const isRed = game.player_red_id === userId;
    const isBlack = game.player_black_id === userId;
    
    if (game.current_turn === 'red' && !isRed) return;
    if (game.current_turn === 'black' && !isBlack) return;

    let board = JSON.parse(game.board_state);
    
    // Apply move
    const piece = board[from.y][from.x];
    if (!piece) return;
    
    // Check if the piece belongs to the player
    if (piece.isHidden) {
      if (piece.owner !== game.current_turn) return;
    } else {
      if (piece.color !== game.current_turn) return;
    }

    const targetPiece = board[to.y][to.x];
    let isGameOver = false;
    let winner = null;

    if (targetPiece) {
      if (targetPiece.isHidden) {
        if (targetPiece.owner === game.current_turn) return;
      } else {
        if (targetPiece.color === game.current_turn) return;
        if (targetPiece.type === 'general') {
          isGameOver = true;
          winner = game.current_turn;
        }
      }
    }
    
    // If it's a face-down piece, flip it
    if (piece.isHidden) {
      piece.isHidden = false;
    }
    
    // Move piece
    board[to.y][to.x] = piece;
    board[from.y][from.x] = null;
    
    const nextTurn = game.current_turn === 'red' ? 'black' : 'red';
    
    if (isGameOver) {
      db.prepare("UPDATE games SET board_state = ?, status = 'finished' WHERE id = ?")
        .run(JSON.stringify(board), gameId);
      io.to(gameId).emit("game_updated", { board, current_turn: game.current_turn, lastMove: { from, to } });
      io.to(gameId).emit("game_over", { winner });
    } else {
      db.prepare("UPDATE games SET board_state = ?, current_turn = ? WHERE id = ?")
        .run(JSON.stringify(board), nextTurn, gameId);
      io.to(gameId).emit("game_updated", { board, current_turn: nextTurn, lastMove: { from, to } });
    }
  });
});

// Helper to generate initial board for Cờ Tướng Úp
function generateInitialBoard() {
  const board = Array(10).fill(null).map(() => Array(9).fill(null));
  
  const redPositions = [
    {x: 0, y: 9}, {x: 1, y: 9}, {x: 2, y: 9}, {x: 3, y: 9}, {x: 5, y: 9}, {x: 6, y: 9}, {x: 7, y: 9}, {x: 8, y: 9},
    {x: 1, y: 7}, {x: 7, y: 7},
    {x: 0, y: 6}, {x: 2, y: 6}, {x: 4, y: 6}, {x: 6, y: 6}, {x: 8, y: 6}
  ];
  
  const blackPositions = [
    {x: 0, y: 0}, {x: 1, y: 0}, {x: 2, y: 0}, {x: 3, y: 0}, {x: 5, y: 0}, {x: 6, y: 0}, {x: 7, y: 0}, {x: 8, y: 0},
    {x: 1, y: 2}, {x: 7, y: 2},
    {x: 0, y: 3}, {x: 2, y: 3}, {x: 4, y: 3}, {x: 6, y: 3}, {x: 8, y: 3}
  ];

  const pieceTypes = [
    'advisor', 'advisor', 'elephant', 'elephant', 'horse', 'horse', 'chariot', 'chariot', 'cannon', 'cannon', 'pawn', 'pawn', 'pawn', 'pawn', 'pawn'
  ];
  
  let allPieces: {type: string, color: string}[] = [];
  for (const type of pieceTypes) {
    allPieces.push({ type, color: 'red' });
    allPieces.push({ type, color: 'black' });
  }
  
  // Shuffle all 30 pieces
  allPieces = allPieces.sort(() => Math.random() - 0.5);

  // Place Generals
  board[9][4] = { type: 'general', color: 'red', isHidden: false };
  board[0][4] = { type: 'general', color: 'black', isHidden: false };

  const allPositions = [...redPositions, ...blackPositions];
  
  for (let i = 0; i < allPositions.length; i++) {
    const pos = allPositions[i];
    const piece = allPieces[i];
    // The piece belongs to the player who controls that side initially? No, the color of the piece determines who owns it once revealed.
    // Wait, before it's revealed, who can move it?
    // In Cờ Tướng Úp, a face-down piece on Red's side belongs to Red until it is revealed!
    // So we need to store its "current owner" (which is based on its starting side) and its "true identity".
    const ownerColor = pos.y > 4 ? 'red' : 'black';
    board[pos.y][pos.x] = { 
      type: piece.type, 
      color: piece.color, // true color
      owner: ownerColor,  // current owner while face down
      isHidden: true 
    };
  }

  // Generals also need owner
  board[9][4].owner = 'red';
  board[0][4].owner = 'black';

  return board;
}

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  const PORT = 3000;
  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

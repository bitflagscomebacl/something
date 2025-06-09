const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ['websocket', 'polling']
});

app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync('uploads')) {
      fs.mkdirSync('uploads');
    }
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp|mp4|mov|avi|pdf|doc|docx|txt/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only images, videos, and documents are allowed!'));
    }
  }
});

// Simple in-memory storage (use database for production)
let chatLogs = [];
let activeUsers = new Set();

// Load chat logs if file exists
const LOGS_FILE = 'chat_logs.json';
if (fs.existsSync(LOGS_FILE)) {
  try {
    chatLogs = JSON.parse(fs.readFileSync(LOGS_FILE, 'utf8'));
  } catch (e) {
    console.log('Could not load chat logs');
  }
}

// Save chat logs
function saveLogs() {
  fs.writeFileSync(LOGS_FILE, JSON.stringify(chatLogs, null, 2));
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// File upload endpoint
app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  const fileUrl = `/uploads/${req.file.filename}`;
  res.json({ 
    url: fileUrl,
    originalName: req.file.originalname,
    size: req.file.size,
    mimetype: req.file.mimetype
  });
});

io.on('connection', (socket) => {
  console.log('User connected');
  
  // Send existing chat logs to new user
  socket.emit('chat_history', chatLogs);
  
  socket.on('join', (username) => {
    socket.username = username;
    activeUsers.add(username);
    
    const joinMsg = {
      type: 'system',
      message: `${username} joined the chat`,
      timestamp: new Date().toISOString(),
      username: 'System'
    };
    
    chatLogs.push(joinMsg);
    saveLogs();
    io.emit('message', joinMsg);
    io.emit('user_list', Array.from(activeUsers));
  });
  
  socket.on('message', (msgData) => {
    if (socket.username) {
      const messageObj = {
        type: 'user',
        message: msgData.message || '',
        media: msgData.media || null,
        username: socket.username,
        timestamp: new Date().toISOString()
      };
      
      chatLogs.push(messageObj);
      saveLogs();
      io.emit('message', messageObj);
    }
  });
  
  socket.on('disconnect', () => {
    if (socket.username) {
      activeUsers.delete(socket.username);
      
      const leaveMsg = {
        type: 'system',
        message: `${socket.username} left the chat`,
        timestamp: new Date().toISOString(),
        username: 'System'
      };
      
      chatLogs.push(leaveMsg);
      saveLogs();
      io.emit('message', leaveMsg);
      io.emit('user_list', Array.from(activeUsers));
    }
    console.log('User disconnected');
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});

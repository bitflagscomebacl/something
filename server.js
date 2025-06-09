const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');

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
  
  socket.on('message', (msg) => {
    if (socket.username) {
      const messageObj = {
        type: 'user',
        message: msg,
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

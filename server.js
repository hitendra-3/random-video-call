// server.js
require('dotenv').config();
const fs = require('fs');
const express = require('express');
const http = require('http');
const https = require('https');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

// In-memory maps (simple for demo)
const users = {};     // socketId -> socketId (present)
const partners = {};  // socketId -> partnerSocketId

// Read env
const PORT = process.env.PORT || (process.env.NODE_ENV === 'production' ? 443 : 3100);
const SSL_KEY_PATH = process.env.SSL_KEY_PATH;       // e.g. /etc/letsencrypt/live/yourdomain/privkey.pem
const SSL_CERT_PATH = process.env.SSL_CERT_PATH;     // e.g. /etc/letsencrypt/live/yourdomain/fullchain.pem

let server;
if (SSL_KEY_PATH && SSL_CERT_PATH && fs.existsSync(SSL_KEY_PATH) && fs.existsSync(SSL_CERT_PATH)) {
  const options = {
    key: fs.readFileSync(SSL_KEY_PATH),
    cert: fs.readFileSync(SSL_CERT_PATH)
  };
  server = https.createServer(options, app);
  console.log('Starting HTTPS server');
} else {
  server = http.createServer(app);
  console.log('Starting HTTP server (use HTTPS in production!)');
}

// configure socket.io
const io = new Server(server, {
  cors: {
    origin: "*", // for demo; restrict to your front-end origin in production
    methods: ["GET", "POST"]
  }
});

io.on('connection', (socket) => {
  console.log('Connected:', socket.id);
  users[socket.id] = socket.id;
  io.emit('onlineCount', Object.keys(users).length);

  // handle join: find an available partner (not already partnered)
  socket.on('join', () => {
    // if already has partner, reply with that partner
    if (partners[socket.id]) {
      socket.emit('ready', partners[socket.id]);
      return;
    }

    // look for someone without a partner (not this socket)
    let partnerId = Object.keys(users).find(id => id !== socket.id && !partners[id]);

    if (partnerId) {
      // bind them
      partners[socket.id] = partnerId;
      partners[partnerId] = socket.id;

      io.to(partnerId).emit('ready', socket.id);
      socket.emit('ready', partnerId);
      console.log(`Paired ${socket.id} <-> ${partnerId}`);
    } else {
      // none found — inform this client to wait
      socket.emit('ready', null);
      console.log(`No partner for ${socket.id} yet`);
    }
  });

  // Offer / Answer / Candidate routing using the partner map
  socket.on('offer', (offer) => {
    const partnerId = partners[socket.id];
    if (partnerId) {
      io.to(partnerId).emit('offer', offer);
    } else {
      console.warn('Offer received but no partner for', socket.id);
    }
  });

  socket.on('answer', (answer) => {
    const partnerId = partners[socket.id];
    if (partnerId) {
      io.to(partnerId).emit('answer', answer);
    } else {
      console.warn('Answer received but no partner for', socket.id);
    }
  });

  socket.on('candidate', (candidate) => {
    const partnerId = partners[socket.id];
    if (partnerId) {
      io.to(partnerId).emit('candidate', candidate);
    } else {
      console.warn('Candidate received but no partner for', socket.id);
    }
  });

  socket.on('disconnect', () => {
    console.log('Disconnected:', socket.id);
    // inform partner
    const partnerId = partners[socket.id];
    if (partnerId) {
      io.to(partnerId).emit('partnerDisconnected');
      delete partners[partnerId];
    }
    delete partners[socket.id];
    delete users[socket.id];
    io.emit('onlineCount', Object.keys(users).length);
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

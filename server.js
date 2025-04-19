const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public'));

// Store users in an object to track connections
let users = {};

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // Add user to the users list
  users[socket.id] = socket.id;
  io.emit('onlineCount', Object.keys(users).length); // Emit online users count

  // Inform the connected user about pairing
  socket.on('join', () => {
    let partnerSocketId = null;
    // Try to find a partner for the user
    for (let id in users) {
      if (id !== socket.id) {
        partnerSocketId = id;
        break;
      }
    }

    if (partnerSocketId) {
      // Pair users and emit 'ready' event to both users
      io.to(partnerSocketId).emit('ready', socket.id);
      socket.emit('ready', partnerSocketId);
    } else {
      console.log('No partner available for user:', socket.id);
      socket.emit('ready', null); // No partner found
    }
  });

  // Handle offer from one user to another
  socket.on('offer', (offer) => {
    const partnerSocketId = Object.keys(users).find(id => id !== socket.id);
    if (partnerSocketId) {
      io.to(partnerSocketId).emit('offer', offer); // Send offer to the partner
    }
  });

  // Handle answer from one user to another
  socket.on('answer', (answer) => {
    const partnerSocketId = Object.keys(users).find(id => id !== socket.id);
    if (partnerSocketId) {
      io.to(partnerSocketId).emit('answer', answer); // Send answer to the partner
    }
  });

  // Handle ICE candidate from one user to another
  socket.on('candidate', (candidate) => {
    const partnerSocketId = Object.keys(users).find(id => id !== socket.id);
    if (partnerSocketId) {
      io.to(partnerSocketId).emit('candidate', candidate); // Send ICE candidate to the partner
    }
  });

  // Handle disconnect event
  socket.on('disconnect', () => {
    delete users[socket.id]; // Remove user from the online list
    io.emit('onlineCount', Object.keys(users).length); // Emit updated online users count

    // Notify the partner that the user has disconnected
    const partnerSocketId = Object.keys(users).find(id => id !== socket.id);
    if (partnerSocketId) {
      io.to(partnerSocketId).emit('partnerDisconnected');
    }

    console.log('A user disconnected:', socket.id);
  });
});

server.listen(3100, () => {
  console.log('Server running at http://localhost:3100');
});

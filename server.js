// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    pingInterval: 10000,
    pingTimeout: 5000,
});

app.use(express.static(__dirname + '/public'));

let waitingUsers = [];
let activePairs = new Map();

io.on('connection', (socket) => {
    io.emit('updateUserCount', io.engine.clientsCount);
    
    socket.on('join', () => {
        if (waitingUsers.length > 0) {
            let partnerId = waitingUsers.shift();
            activePairs.set(socket.id, partnerId);
            activePairs.set(partnerId, socket.id);
            io.to(socket.id).emit('ready', partnerId);
            io.to(partnerId).emit('ready', socket.id);
        } else {
            waitingUsers.push(socket.id);
        }
    });
    
    socket.on('chatMessage', ({ target, message }) => {
        if (activePairs.has(target)) {
            io.to(target).emit('chatMessage', { message });
        }
    });
    
    socket.on('leave', () => {
        let partnerId = activePairs.get(socket.id);
        if (partnerId) {
            io.to(partnerId).emit('partnerLeft');
            activePairs.delete(partnerId);
            activePairs.delete(socket.id);
        }
        waitingUsers = waitingUsers.filter(id => id !== socket.id);
        socket.disconnect();
    });
    
    socket.on('disconnect', () => {
        let partnerId = activePairs.get(socket.id);
        if (partnerId) {
            io.to(partnerId).emit('partnerLeft');
            activePairs.delete(partnerId);
            activePairs.delete(socket.id);
        }
        waitingUsers = waitingUsers.filter(id => id !== socket.id);
        io.emit('updateUserCount', io.engine.clientsCount);
    });
});

server.listen(3000, () => {
    console.log('Server is running on port 3000');
});

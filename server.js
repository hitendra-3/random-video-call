const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Allow all origins for testing; adjust for production
        methods: ["GET", "POST"]
    },
    pingInterval: 10000,
    pingTimeout: 5000
});

app.use(express.static("public")); // Serve static files from "public" folder

let waitingUsers = [];
let activePairs = new Map();

io.on("connection", (socket) => {
    console.log(`User connected: ${socket.id}`);
    io.emit("updateUserCount", io.engine.clientsCount);

    // Handle user joining the queue
    socket.on("join", () => {
        if (waitingUsers.length > 0) {
            let partnerId = waitingUsers.shift(); // Pair with waiting user
            activePairs.set(socket.id, partnerId);
            activePairs.set(partnerId, socket.id);

            io.to(socket.id).emit("ready", partnerId);
            io.to(partnerId).emit("ready", socket.id);
        } else {
            waitingUsers.push(socket.id);
        }
    });

    // Handle chat messages
    socket.on("chatMessage", ({ target, message }) => {
        if (activePairs.has(target) && io.sockets.sockets.has(target)) {
            io.to(target).emit("chatMessage", { message });
        }
    });

    // Handle WebRTC signaling
    socket.on("offer", ({ target, offer }) => {
        io.to(target).emit("offer", { sender: socket.id, offer });
    });

    socket.on("answer", ({ target, answer }) => {
        io.to(target).emit("answer", { sender: socket.id, answer });
    });

    socket.on("iceCandidate", ({ target, candidate }) => {
        io.to(target).emit("iceCandidate", { candidate });
    });

    // Handle user leaving the call
    socket.on("leave", () => {
        let partnerId = activePairs.get(socket.id);
        if (partnerId) {
            io.to(partnerId).emit("partnerLeft");
            activePairs.delete(partnerId);
            activePairs.delete(socket.id);
        }
        waitingUsers = waitingUsers.filter(id => id !== socket.id);
        socket.disconnect();
    });

    // Handle disconnection
    socket.on("disconnect", () => {
        console.log(`User disconnected: ${socket.id}`);

        let partnerId = activePairs.get(socket.id);
        if (partnerId) {
            io.to(partnerId).emit("partnerLeft");
            activePairs.delete(partnerId);
            activePairs.delete(socket.id);
        }
        waitingUsers = waitingUsers.filter(id => id !== socket.id);
        io.emit("updateUserCount", io.engine.clientsCount);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

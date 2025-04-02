const socket = io("wss://your-railway-app-url.uprailway.app", {
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000
});

let localStream, peerConnection, partnerSocketId = null;
let callTimer, callStartTime;
const config = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

// Dark Mode Persistence
if (localStorage.getItem("darkMode") === "enabled") {
    document.body.classList.add("dark-mode");
}
document.getElementById("toggleDarkMode").onclick = () => {
    document.body.classList.toggle("dark-mode");
    localStorage.setItem("darkMode", document.body.classList.contains("dark-mode") ? "enabled" : "disabled");
};

// Start Call
document.getElementById("startCall").onclick = async () => {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        document.getElementById("localVideo").srcObject = localStream;
        socket.emit("join");
    } catch (error) {
        console.error("Error accessing media devices:", error);
    }
};

// Stop Call
document.getElementById("stopCall").onclick = () => {
    if (confirm("Are you sure you want to leave the call?")) {
        cleanup();
        socket.emit("leave", partnerSocketId);
    }
};

// Send Chat Message
document.getElementById("sendChat").onclick = () => {
    let message = document.getElementById("chatInput").value;
    if (message.trim()) {
        socket.emit("chatMessage", { target: partnerSocketId, message });
        appendMessage("You: " + message);
        document.getElementById("chatInput").value = "";
    }
};

// Update User Count
socket.on("updateUserCount", (count) => {
    document.getElementById("userCount").innerText = `Online Users: ${count}`;
});

// Handle Call Readiness
socket.on("ready", (partnerId) => {
    partnerSocketId = partnerId;
    createPeerConnection();
    makeOffer();
    startCallTimer();
});

// Receive Chat Message
socket.on("chatMessage", ({ message }) => {
    appendMessage("Partner: " + message);
});

// Partner Left
socket.on("partnerLeft", () => {
    alert("Your partner has left the call.");
    cleanup();
});

// Handle Disconnection
socket.on("disconnect", () => {
    console.log("Disconnected. Attempting to reconnect...");
});

socket.on("connect_error", () => {
    console.log("Reconnecting...");
});

// Append messages in chatbox
function appendMessage(msg) {
    let chatBox = document.getElementById("chatBox");
    let p = document.createElement("p");
    p.innerText = msg;
    chatBox.appendChild(p);
    chatBox.scrollTop = chatBox.scrollHeight;
}

// Start Call Timer
function startCallTimer() {
    callStartTime = Date.now();
    callTimer = setInterval(() => {
        let elapsed = Math.floor((Date.now() - callStartTime) / 1000);
        let minutes = String(Math.floor(elapsed / 60)).padStart(2, "0");
        let seconds = String(elapsed % 60).padStart(2, "0");
        document.getElementById("callTimer").innerText = `Call Duration: ${minutes}:${seconds}`;
    }, 1000);
}

// Cleanup Function
function cleanup() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    document.getElementById("remoteVideo").srcObject = null;
    document.getElementById("localVideo").srcObject = null;
    clearInterval(callTimer);
    document.getElementById("callTimer").innerText = "Call Duration: 00:00";
}

// Create Peer Connection & Handle Tracks
function createPeerConnection() {
    peerConnection = new RTCPeerConnection(config);

    peerConnection.onicecandidate = event => {
        if (event.candidate) {
            socket.emit("iceCandidate", { target: partnerSocketId, candidate: event.candidate });
        }
    };

    peerConnection.ontrack = event => {
        if (event.streams.length > 0) {
            document.getElementById("remoteVideo").srcObject = event.streams[0];
        }
    };

    if (localStream) {
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
    }
}

// Handle Incoming WebRTC Messages
socket.on("offer", async ({ offer, sender }) => {
    partnerSocketId = sender;
    createPeerConnection();
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit("answer", { target: partnerSocketId, answer });
});

socket.on("answer", async ({ answer }) => {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
});

socket.on("iceCandidate", ({ candidate }) => {
    peerConnection.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.error);
});

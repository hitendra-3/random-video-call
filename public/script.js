const socket = io(); // Connect to server

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
    if (message.trim() && partnerSocketId) {
        socket.emit("chatMessage", { target: partnerSocketId, message });
        appendMessage("You: " + message);
        document.getElementById("chatInput").value = "";
    }
};

// Handle Socket Events
socket.on("updateUserCount", (count) => {
    document.getElementById("userCount").innerText = `Online Users: ${count}`;
});

socket.on("ready", (partnerId) => {
    partnerSocketId = partnerId;
    createPeerConnection();
    makeOffer();
    startCallTimer();
});

socket.on("chatMessage", ({ message }) => appendMessage("Partner: " + message));

socket.on("partnerLeft", () => {
    alert("Your partner has left the call.");
    cleanup();
});

// Append messages in chatbox
function appendMessage(msg) {
    let chatBox = document.getElementById("chatBox");
    let p = document.createElement("p");
    p.innerText = msg;
    chatBox.appendChild(p);
    chatBox.scrollTop = chatBox.scrollHeight;
}

// WebRTC Setup
function createPeerConnection() {
    peerConnection = new RTCPeerConnection(config);
    peerConnection.onicecandidate = event => {
        if (event.candidate) socket.emit("iceCandidate", { target: partnerSocketId, candidate: event.candidate });
    };
    peerConnection.ontrack = event => {
        document.getElementById("remoteVideo").srcObject = event.streams[0];
    };
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
}

async function makeOffer() {
    let offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit("offer", { target: partnerSocketId, offer });
}

// Cleanup
function cleanup() {
    if (peerConnection) peerConnection.close();
    if (localStream) localStream.getTracks().forEach(track => track.stop());
    document.getElementById("remoteVideo").srcObject = null;
    document.getElementById("localVideo").srcObject = null;
}

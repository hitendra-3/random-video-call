// script.js
const socket = io({
    reconnection: true,
    reconnectionAttempts: 10, // Retry 10 times before giving up
    reconnectionDelay: 1000, // Wait 1 second between attempts
    reconnectionDelayMax: 5000 // Max wait time of 5 seconds
});

let localStream, peerConnection, partnerSocketId = null;
let callTimer, callStartTime;
const config = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

// Dark mode persistence
if (localStorage.getItem('darkMode') === 'enabled') {
    document.body.classList.add('dark-mode');
}
document.getElementById('toggleDarkMode').onclick = () => {
    document.body.classList.toggle('dark-mode');
    localStorage.setItem('darkMode', document.body.classList.contains('dark-mode') ? 'enabled' : 'disabled');
};

document.getElementById('startCall').onclick = async () => {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        document.getElementById('localVideo').srcObject = localStream;
        socket.emit('join');
    } catch (error) {
        console.error("Error accessing media devices:", error);
    }
};

document.getElementById('stopCall').onclick = () => {
    if (confirm("Are you sure you want to leave the call?")) {
        cleanup();
        socket.emit('leave', partnerSocketId);
    }
};

document.getElementById('sendChat').onclick = () => {
    let message = document.getElementById('chatInput').value;
    if (message.trim()) {
        socket.emit('chatMessage', { target: partnerSocketId, message });
        appendMessage("You: " + message);
        document.getElementById('chatInput').value = "";
    }
};

socket.on('updateUserCount', (count) => {
    document.getElementById('userCount').innerText = `Online Users: ${count}`;
});

socket.on('ready', (partnerId) => {
    partnerSocketId = partnerId;
    createPeerConnection();
    makeOffer();
    startCallTimer();
});

socket.on('chatMessage', ({ message }) => {
    appendMessage("Partner: " + message);
});

socket.on('partnerLeft', () => {
    alert("Your partner has left the call.");
    cleanup();
});

socket.on('disconnect', () => {
    console.log("Disconnected. Attempting to reconnect...");
});

socket.on('connect_error', () => {
    console.log("Reconnecting...");
});

function appendMessage(msg) {
    let chatBox = document.getElementById('chatBox');
    let p = document.createElement('p');
    p.innerText = msg;
    chatBox.appendChild(p);
    chatBox.scrollTop = chatBox.scrollHeight;
}

function startCallTimer() {
    callStartTime = Date.now();
    callTimer = setInterval(() => {
        let elapsed = Math.floor((Date.now() - callStartTime) / 1000);
        let minutes = String(Math.floor(elapsed / 60)).padStart(2, '0');
        let seconds = String(elapsed % 60).padStart(2, '0');
        document.getElementById('callTimer').innerText = `Call Duration: ${minutes}:${seconds}`;
    }, 1000);
}

function cleanup() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    document.getElementById('remoteVideo').srcObject = null;
    document.getElementById('localVideo').srcObject = null;
    clearInterval(callTimer);
    document.getElementById('callTimer').innerText = "Call Duration: 00:00";
}
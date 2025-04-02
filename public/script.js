const socket = io({
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000
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

// 📌 Append messages in chatbox
function appendMessage(msg) {
    let chatBox = document.getElementById('chatBox');
    let p = document.createElement('p');
    p.innerText = msg;
    chatBox.appendChild(p);
    chatBox.scrollTop = chatBox.scrollHeight;
}

// 📌 Start Call Timer
function startCallTimer() {
    callStartTime = Date.now();
    callTimer = setInterval(() => {
        let elapsed = Math.floor((Date.now() - callStartTime) / 1000);
        let minutes = String(Math.floor(elapsed / 60)).padStart(2, '0');
        let seconds = String(elapsed % 60).padStart(2, '0');
        document.getElementById('callTimer').innerText = `Call Duration: ${minutes}:${seconds}`;
    }, 1000);
}

// 📌 Cleanup Function
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

// 📌 Create Peer Connection & Handle Tracks
function createPeerConnection() {
    peerConnection = new RTCPeerConnection(config);

    peerConnection.onicecandidate = event => {
        if (event.candidate) {
            socket.emit("iceCandidate", { target: partnerSocketId, candidate: event.candidate });
        }
    };

    peerConnection.ontrack = event => {
        console.log("Receiving remote video stream");
        document.getElementById('remoteVideo').srcObject = event.streams[0]; // Show partner video
    };

    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });
}

// 📌 Create Offer (Caller)
async function makeOffer() {
    try {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        socket.emit("offer", { target: partnerSocketId, offer });
    } catch (error) {
        console.error("Error creating offer:", error);
    }
}

// 📌 Handle Incoming Offer (Receiver)
socket.on("offer", async ({ offer, sender }) => {
    try {
        partnerSocketId = sender;
        createPeerConnection();
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit("answer", { target: partnerSocketId, answer });
    } catch (error) {
        console.error("Error handling offer:", error);
    }
});

// 📌 Handle Incoming Answer
socket.on("answer", async ({ answer }) => {
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (error) {
        console.error("Error setting remote description:", error);
    }
});

// 📌 Handle ICE Candidates
socket.on("iceCandidate", ({ candidate }) => {
    peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
});

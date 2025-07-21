const socket = io();

let localStream;
let peerConnection;
let partnerSocketId = null;

const config = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" }
  ]
};

// Elements
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const onlineUsers = document.getElementById('onlineUsers');
const startCallBtn = document.getElementById('startCall');
const endCallBtn = document.getElementById('endCall');

// Start Call
startCallBtn.onclick = async () => {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
    socket.emit('join');
    startCallBtn.disabled = true;  // Disable start call button while waiting
    alert('Waiting for another user to join...');
  } catch (err) {
    console.error('Error accessing media devices:', err);
    alert('Could not access camera/mic. Please check permissions or device connection.');
  }
};

// Ready to start call (from the server)
socket.on('ready', (partnerId) => {
  partnerSocketId = partnerId;
  createPeerConnection();
  if (socket.id < partnerSocketId) {
    makeOffer();  // Only the first user sends the offer
  }
});

// Handle Offer
socket.on('offer', async (offer) => {
  createPeerConnection();
  await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  socket.emit('answer', answer);
});

// Handle Answer
socket.on('answer', async (answer) => {
  await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
});

// Handle ICE Candidate
socket.on('candidate', async (candidate) => {
  if (peerConnection) {
    try {
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      console.error('Error adding ICE candidate', e);
    }
  }
});

// ✅ Online user count update
socket.on('onlineCount', (count) => {
  onlineUsers.innerText = `Online Users: ${count}`;
});

// Create Peer Connection
function createPeerConnection() {
  peerConnection = new RTCPeerConnection(config);

  // Add local tracks to the peer connection
  localStream.getTracks().forEach(track => {
    peerConnection.addTrack(track, localStream);
  });

  // Handle ICE candidates
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('candidate', event.candidate);
    }
  };

  // Handle remote tracks
  peerConnection.ontrack = (event) => {
    remoteVideo.srcObject = event.streams[0];
  };

  // Monitor connection state
  peerConnection.oniceconnectionstatechange = () => {
    if (peerConnection.iceConnectionState === 'failed') {
      alert('Connection failed, please try again!');
      endCall();
    }
  };
}

// Make an offer to start the call
async function makeOffer() {
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  socket.emit('offer', offer);
}

// End Call
endCallBtn.onclick = () => {
  endCall();
};

function endCall() {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
    remoteVideo.srcObject = null;

    // Stop all tracks (media devices)
    localStream.getTracks().forEach(track => track.stop());
    startCallBtn.disabled = false;  // Re-enable start call button
  }
}
//end
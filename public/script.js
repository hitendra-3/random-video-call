const TURN_URL = null; // e.g. "turn:your-turn-server:3478"
const TURN_USERNAME = null;
const TURN_CREDENTIAL = null;

const iceServers = [
  { urls: "stun:stun.l.google.com:19302" }
];

if (TURN_URL && TURN_USERNAME && TURN_CREDENTIAL) {
  iceServers.push({
    urls: TURN_URL,
    username: TURN_USERNAME,
    credential: TURN_CREDENTIAL
  });
}

const socket = io("https://random-video-call-wqh5.onrender.com");

let localStream = null;
let peerConnection = null;
let partnerSocketId = null;
let isAudioMuted = false;
let isVideoOff = false;
let chatMessages = [];

const config = { iceServers };

// Elements
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const onlineUsers = document.getElementById('onlineUsers');
const startCallBtn = document.getElementById('startCall');
const endCallBtn = document.getElementById('endCall');
const toggleChatBtn = document.getElementById('toggleChat');
const closeChatBtn = document.getElementById('closeChat');
const chatPanel = document.querySelector('.chat-panel');
const chatMessagesContainer = document.getElementById('chatMessages');
const messageInput = document.getElementById('messageInput');
const sendMessageBtn = document.getElementById('sendMessage');
const settingsBtn = document.getElementById('settingsBtn');
const notificationToast = document.getElementById('notificationToast');
const toastMessage = document.getElementById('toastMessage');
const micBtn = document.querySelector('.mic-btn');
const camBtn = document.querySelector('.cam-btn');
const waitingOverlay = document.querySelector('.waiting-partner');
const partnerInfo = document.querySelector('.partner-info');

// Initialize
document.addEventListener('DOMContentLoaded', init);

function init() {
  setupEventListeners();
  checkMediaPermissions();
}

function setupEventListeners() {
  startCallBtn.onclick = startCall;
  endCallBtn.onclick = endCall;
  toggleChatBtn.onclick = toggleChat;
  closeChatBtn.onclick = toggleChat;
  sendMessageBtn.onclick = sendMessage;
  messageInput.onkeypress = (e) => {
    if (e.key === 'Enter') sendMessage();
  };
  settingsBtn.onclick = showSettings;
  micBtn.onclick = toggleAudio;
  camBtn.onclick = toggleVideo;
}

function checkMediaPermissions() {
  navigator.mediaDevices.enumerateDevices()
    .then(devices => {
      const hasAudio = devices.some(device => device.kind === 'audioinput');
      const hasVideo = devices.some(device => device.kind === 'videoinput');
      
      if (!hasAudio) showNotification('No microphone detected');
      if (!hasVideo) showNotification('No camera detected');
    })
    .catch(err => {
      console.error('Error enumerating devices:', err);
    });
}

async function startCall() {
  startCallBtn.disabled = true;
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ 
      video: true, 
      audio: true 
    });
    
    localVideo.srcObject = localStream;
    socket.emit('join');
    
    showNotification('Looking for a partner...');
  } catch (err) {
    console.error('Error accessing media devices:', err);
    showNotification('Could not access camera/mic. Please check permissions.');
    startCallBtn.disabled = false;
  }
}

socket.on('ready', async (partnerId) => {
  partnerSocketId = partnerId;
  
  if (!partnerId) {
    console.log('No partner yet - waiting...');
    return;
  }

  console.log('Paired with', partnerId);
  showNotification('Partner found! Connecting...');
  
  createPeerConnection();

  // Deterministic offerer (to avoid collision): smaller socket id initiates
  try {
    if (socket.id < partnerSocketId) {
      await makeOffer();
    }
  } catch (err) {
    console.error('Error making offer:', err);
    showNotification('Connection error. Please try again.');
  }
});

socket.on('offer', async (offer) => {
  try {
    createPeerConnection();
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit('answer', answer, partnerSocketId);
  } catch (err) {
    console.error('Error handling offer:', err);
  }
});

socket.on('answer', async (answer) => {
  try {
    if (!peerConnection) {
      console.warn('Received answer but no peerConnection exists yet');
      return;
    }
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
  } catch (err) {
    console.error('Error setting remote description (answer):', err);
  }
});

socket.on('candidate', async (candidate) => {
  try {
    if (peerConnection && candidate) {
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    }
  } catch (e) {
    console.error('Error adding ICE candidate', e);
  }
});

socket.on('onlineCount', (count) => {
  onlineUsers.innerText = `Online: ${count}`;
});

socket.on('partnerDisconnected', () => {
  showNotification('Partner disconnected');
  endCall();
});

socket.on('chatMessage', (data) => {
  addMessage(data.message, data.sender, false);
});

function createPeerConnection() {
  if (peerConnection) return;

  peerConnection = new RTCPeerConnection(config);

  // Add local tracks if we have them
  if (localStream) {
    localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, localStream);
    });
  }

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('candidate', event.candidate, partnerSocketId);
    }
  };

  peerConnection.ontrack = (event) => {
    if (event.streams && event.streams[0]) {
      remoteVideo.srcObject = event.streams[0];
      waitingOverlay.classList.add('hidden');
      partnerInfo.classList.remove('hidden');
    } else {
      const inboundStream = new MediaStream();
      event.track && inboundStream.addTrack(event.track);
      remoteVideo.srcObject = inboundStream;
      waitingOverlay.classList.add('hidden');
      partnerInfo.classList.remove('hidden');
    }
  };

  peerConnection.oniceconnectionstatechange = () => {
    const state = peerConnection.iceConnectionState;
    console.log('ICE connection state:', state);
    
    if (state === 'connected') {
      showNotification('Call connected!');
      endCallBtn.disabled = false;
    } else if (state === 'failed' || state === 'disconnected') {
      showNotification('Connection lost. Ending call.');
      endCall();
    }
  };

  endCallBtn.disabled = false;
}

async function makeOffer() {
  if (!peerConnection) createPeerConnection();
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  socket.emit('offer', offer, partnerSocketId);
}

function endCall() {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  
  if (remoteVideo) remoteVideo.srcObject = null;
  
  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
    localVideo.srcObject = null;
  }

  startCallBtn.disabled = false;
  endCallBtn.disabled = true;
  partnerSocketId = null;
  
  waitingOverlay.classList.remove('hidden');
  partnerInfo.classList.add('hidden');
  
  socket.emit('leave');
}

function toggleAudio() {
  if (!localStream) return;
  
  const audioTracks = localStream.getAudioTracks();
  if (audioTracks.length === 0) return;
  
  isAudioMuted = !isAudioMuted;
  audioTracks.forEach(track => {
    track.enabled = !isAudioMuted;
  });
  
  micBtn.classList.toggle('active', !isAudioMuted);
  showNotification(isAudioMuted ? 'Microphone muted' : 'Microphone on');
}

function toggleVideo() {
  if (!localStream) return;
  
  const videoTracks = localStream.getVideoTracks();
  if (videoTracks.length === 0) return;
  
  isVideoOff = !isVideoOff;
  videoTracks.forEach(track => {
    track.enabled = !isVideoOff;
  });
  
  camBtn.classList.toggle('active', !isVideoOff);
  showNotification(isVideoOff ? 'Camera off' : 'Camera on');
}

function toggleChat() {
  chatPanel.classList.toggle('open');
}

function sendMessage() {
  const message = messageInput.value.trim();
  if (!message || !partnerSocketId) return;
  
  // Add to chat
  addMessage(message, 'You', true);
  
  // Send to partner
  socket.emit('chatMessage', {
    message,
    to: partnerSocketId
  });
  
  // Clear input
  messageInput.value = '';
}

function addMessage(text, sender, isOwn) {
  const messageElement = document.createElement('div');
  messageElement.classList.add('message');
  messageElement.classList.add(isOwn ? 'own' : 'partner');
  
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  
  messageElement.innerHTML = `
    <div class="message-text">${text}</div>
    <small class="message-time">${time}</small>
  `;
  
  chatMessagesContainer.appendChild(messageElement);
  chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
  
  // Add to history
  chatMessages.push({
    text,
    sender,
    time,
    isOwn
  });
}

function showSettings() {
  // This would open a modal with settings options
  showNotification('Settings feature coming soon!');
}

function showNotification(message) {
  toastMessage.textContent = message;
  notificationToast.classList.add('show');
  
  setTimeout(() => {
    notificationToast.classList.remove('show');
  }, 3000);
}

// Handle page visibility change
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    console.log('Page is hidden');
    // Could pause video to save resources
  } else {
    console.log('Page is visible');
    // Resume video if needed
  }
});

// Handle beforeunload
window.addEventListener('beforeunload', () => {
  if (peerConnection) {
    socket.emit('leave');
  }
});
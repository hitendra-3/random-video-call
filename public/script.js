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

    const socket = io("https://random-video-call-wqh5.onrender.com/"); // connects to same origin where page loaded

    let localStream = null;
    let peerConnection = null;
    let partnerSocketId = null;

    const config = { iceServers };

    // Elements
    const localVideo = document.getElementById('localVideo');
    const remoteVideo = document.getElementById('remoteVideo');
    const onlineUsers = document.getElementById('onlineUsers');
    const startCallBtn = document.getElementById('startCall');
    const endCallBtn = document.getElementById('endCall');

    startCallBtn.onclick = async () => {
      startCallBtn.disabled = true;
      try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
        // emit join only after we have local stream
        socket.emit('join');
        alert('Waiting for a partner (server will pair you when someone else joins)...');
      } catch (err) {
        console.error('Error accessing media devices:', err);
        alert('Could not access camera/mic. Please check permissions or device connection.');
        startCallBtn.disabled = false;
      }
    };

    socket.on('ready', async (partnerId) => {
      partnerSocketId = partnerId;
      if (!partnerId) {
        // no partner yet
        console.log('No partner yet - waiting...');
        return;
      }

      console.log('Paired with', partnerId);
      createPeerConnection();

      // Deterministic offerer (to avoid collision): smaller socket id initiates
      try {
        if (socket.id < partnerSocketId) {
          await makeOffer();
        }
      } catch (err) {
        console.error('Error making offer:', err);
      }
    });

    socket.on('offer', async (offer) => {
      try {
        createPeerConnection();
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('answer', answer);
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
      onlineUsers.innerText = `Online Users: ${count}`;
    });

    socket.on('partnerDisconnected', () => {
      alert('Partner disconnected');
      endCall();
    });

    function createPeerConnection() {
      if (peerConnection) return; // already created

      peerConnection = new RTCPeerConnection(config);

      // Add local tracks if we have them
      if (localStream) {
        localStream.getTracks().forEach(track => {
          peerConnection.addTrack(track, localStream);
        });
      }

      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('candidate', event.candidate);
        }
      };

      peerConnection.ontrack = (event) => {
        // set remote stream (first stream)
        if (event.streams && event.streams[0]) {
          remoteVideo.srcObject = event.streams[0];
        } else {
          // older behavior: build a stream from inbound tracks
          const inboundStream = new MediaStream();
          event.track && inboundStream.addTrack(event.track);
          remoteVideo.srcObject = inboundStream;
        }
      };

      peerConnection.oniceconnectionstatechange = () => {
        const state = peerConnection.iceConnectionState;
        console.log('ICE connection state:', state);
        if (state === 'failed' || state === 'disconnected') {
          // try closing and cleanup
          alert('Connection state is ' + state + '. Ending call.');
          endCall();
        }
      };

      // If local stream becomes available later (edge cases), add tracks
      if (!localStream) {
        // attempt to get user media lazily (rare)
        navigator.mediaDevices.getUserMedia({ video: true, audio: true })
          .then(stream => {
            localStream = stream;
            localVideo.srcObject = localStream;
            localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
          })
          .catch(err => {
            console.warn('Could not get media when adding to existing peerConnection', err);
          });
      }

      endCallBtn.disabled = false;
    }

    async function makeOffer() {
      if (!peerConnection) createPeerConnection();
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      socket.emit('offer', offer);
    }

    endCallBtn.onclick = () => {
      endCall();
    };

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
      // Optionally notify server that you left / could re-emit 'join' to find another
    }
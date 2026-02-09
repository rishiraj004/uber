import { useState, useEffect, useRef, useCallback } from 'react';
import { Phone, PhoneOff, PhoneIncoming, Mic, MicOff, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSocket } from '../context/socket-context';
import toast from 'react-hot-toast';

type CallState = 'idle' | 'outgoing' | 'incoming' | 'connected';

interface InAppCallProps {
  rideId: number;
  recipientName: string;
  recipientRole: 'RIDER' | 'CAPTAIN';
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

const InAppCall = ({ rideId, recipientName, recipientRole }: InAppCallProps) => {
  const socket = useSocket();
  const [callState, setCallState] = useState<CallState>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [incomingCallerName, setIncomingCallerName] = useState('');

  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const localStream = useRef<MediaStream | null>(null);
  const remoteAudio = useRef<HTMLAudioElement | null>(null);
  const callTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const ringtoneTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callStateRef = useRef<CallState>(callState);

  // Cleanup function for call resources
  const cleanupCall = useCallback(() => {
    if (callTimer.current) {
      clearInterval(callTimer.current);
      callTimer.current = null;
    }
    if (ringtoneTimeout.current) {
      clearTimeout(ringtoneTimeout.current);
      ringtoneTimeout.current = null;
    }
    if (peerConnection.current) {
      peerConnection.current.close();
      peerConnection.current = null;
    }
    if (localStream.current) {
      localStream.current.getTracks().forEach(track => track.stop());
      localStream.current = null;
    }
    setCallDuration(0);
    setIsMuted(false);
  }, []);

  // End active call
  const handleEndCall = useCallback(() => {
    if (socket) {
      socket.emit('CALL_END', { rideId });
    }
    cleanupCall();
    setCallState('idle');
  }, [socket, rideId, cleanupCall]);

  // Create peer connection with event handlers
  const createPeerConnection = useCallback(() => {
    const pc = new RTCPeerConnection(ICE_SERVERS);

    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit('WEBRTC_ICE_CANDIDATE', {
          rideId,
          candidate: event.candidate,
        });
      }
    };

    pc.ontrack = (event) => {
      if (remoteAudio.current) {
        remoteAudio.current.srcObject = event.streams[0];
        remoteAudio.current.play().catch(console.error);
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
        handleEndCall();
      }
    };

    peerConnection.current = pc;
    return pc;
  }, [socket, rideId, handleEndCall]);

  // Start outgoing call
  const handleStartCall = async () => {
    if (!socket || callState !== 'idle') return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStream.current = stream;

      const pc = createPeerConnection();
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socket.emit('CALL_INITIATE', { rideId });
      setCallState('outgoing');

      // Auto-cancel after 30s if not answered
      ringtoneTimeout.current = setTimeout(() => {
        if (callStateRef.current === 'outgoing') {
          handleEndCall();
          toast.error('No answer');
        }
      }, 30000);
    } catch (err) {
      console.error('Failed to start call:', err);
      toast.error('Microphone access required for calls');
      cleanupCall();
    }
  };

  // Accept incoming call
  const handleAcceptCall = async () => {
    if (!socket || callState !== 'incoming') return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStream.current = stream;

      const pc = createPeerConnection();
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      socket.emit('CALL_ACCEPT', { rideId });
      setCallState('connected');

      // Start call duration timer
      callTimer.current = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Failed to accept call:', err);
      toast.error('Microphone access required');
      handleRejectCall();
    }
  };

  // Reject incoming call
  const handleRejectCall = useCallback(() => {
    if (socket) {
      socket.emit('CALL_REJECT', { rideId });
    }
    cleanupCall();
    setCallState('idle');
  }, [socket, rideId, cleanupCall]);

  // Toggle mute
  const toggleMute = () => {
    if (localStream.current) {
      const audioTrack = localStream.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  // Format call duration MM:SS
  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // Socket event listeners
  useEffect(() => {
    if (!socket) return;

    const handleIncomingCall = (data: { rideId: number; callerName: string; callerRole: string }) => {
      if (data.rideId === rideId && callState === 'idle') {
        setIncomingCallerName(data.callerName || 'Unknown');
        setCallState('incoming');

        // Auto-reject after 30s (only if still incoming)
        ringtoneTimeout.current = setTimeout(() => {
          if (callStateRef.current === 'incoming') {
            handleRejectCall();
          }
        }, 30000);
      }
    };

    const handleCallAccepted = async () => {
      if (callState !== 'outgoing' || !peerConnection.current) return;

      if (ringtoneTimeout.current) {
        clearTimeout(ringtoneTimeout.current);
        ringtoneTimeout.current = null;
      }

      // The callee accepted - send our offer now
      const offer = peerConnection.current.localDescription;
      if (offer) {
        socket.emit('WEBRTC_OFFER', { rideId, offer });
      }

      setCallState('connected');
      callTimer.current = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    };

    const handleCallRejected = () => {
      toast('Call declined', { icon: '📵' });
      cleanupCall();
      setCallState('idle');
    };

    const handleCallEnded = () => {
      toast('Call ended', { icon: '📞' });
      cleanupCall();
      setCallState('idle');
    };

    const handleWebRTCOffer = async (data: { rideId: number; offer: RTCSessionDescriptionInit }) => {
      if (data.rideId !== rideId || !peerConnection.current) return;

      try {
        await peerConnection.current.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await peerConnection.current.createAnswer();
        await peerConnection.current.setLocalDescription(answer);

        socket.emit('WEBRTC_ANSWER', { rideId, answer });
      } catch (err) {
        console.error('Error handling WebRTC offer:', err);
      }
    };

    const handleWebRTCAnswer = async (data: { rideId: number; answer: RTCSessionDescriptionInit }) => {
      if (data.rideId !== rideId || !peerConnection.current) return;

      try {
        await peerConnection.current.setRemoteDescription(new RTCSessionDescription(data.answer));
      } catch (err) {
        console.error('Error handling WebRTC answer:', err);
      }
    };

    const handleICECandidate = async (data: { rideId: number; candidate: RTCIceCandidateInit }) => {
      if (data.rideId !== rideId || !peerConnection.current) return;

      try {
        await peerConnection.current.addIceCandidate(new RTCIceCandidate(data.candidate));
      } catch (err) {
        console.error('Error adding ICE candidate:', err);
      }
    };

    socket.on('INCOMING_CALL', handleIncomingCall);
    socket.on('CALL_ACCEPTED', handleCallAccepted);
    socket.on('CALL_REJECTED', handleCallRejected);
    socket.on('CALL_ENDED', handleCallEnded);
    socket.on('WEBRTC_OFFER', handleWebRTCOffer);
    socket.on('WEBRTC_ANSWER', handleWebRTCAnswer);
    socket.on('WEBRTC_ICE_CANDIDATE', handleICECandidate);

    return () => {
      socket.off('INCOMING_CALL', handleIncomingCall);
      socket.off('CALL_ACCEPTED', handleCallAccepted);
      socket.off('CALL_REJECTED', handleCallRejected);
      socket.off('CALL_ENDED', handleCallEnded);
      socket.off('WEBRTC_OFFER', handleWebRTCOffer);
      socket.off('WEBRTC_ANSWER', handleWebRTCAnswer);
      socket.off('WEBRTC_ICE_CANDIDATE', handleICECandidate);
    };
  }, [socket, rideId, callState, cleanupCall, handleEndCall, handleRejectCall]);

  // keep a mutable ref in sync with callState to avoid stale closures
  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupCall();
    };
  }, [cleanupCall]);

  return (
    <>
      {/* Hidden audio element for remote stream */}
      <audio ref={remoteAudio} autoPlay playsInline />

      {/* Call trigger button (idle state) */}
      {callState === 'idle' && (
        <button
          onClick={handleStartCall}
          title={`Call ${recipientRole === 'RIDER' ? 'rider' : 'captain'}`}
          className="p-2.5 sm:p-3 bg-green-100 rounded-xl text-green-600 hover:bg-green-200 transition-colors"
        >
          <Phone size={18} className="sm:w-5 sm:h-5" />
        </button>
      )}

      {/* Active call UI (outgoing / connected) - small floating bar */}
      {(callState === 'outgoing' || callState === 'connected') && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 bg-green-600 text-white px-3 py-2 rounded-xl shadow-lg"
        >
          <div className="flex flex-col">
            <span className="text-[10px] font-medium opacity-80">
              {callState === 'outgoing' ? 'Calling...' : formatDuration(callDuration)}
            </span>
            <span className="text-xs font-bold truncate max-w-20">{recipientName}</span>
          </div>

          {callState === 'connected' && (
            <button
              onClick={toggleMute}
              className={`p-1.5 rounded-lg transition-colors ${
                isMuted ? 'bg-red-500' : 'bg-white/20 hover:bg-white/30'
              }`}
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <MicOff size={14} /> : <Mic size={14} />}
            </button>
          )}

          <button
            onClick={handleEndCall}
            className="p-1.5 bg-red-500 rounded-lg hover:bg-red-600 transition-colors"
            title="End call"
          >
            <PhoneOff size={14} />
          </button>
        </motion.div>
      )}

      {/* Incoming call overlay */}
      <AnimatePresence>
        {callState === 'incoming' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 z-100 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="bg-white rounded-3xl p-8 w-full max-w-xs shadow-2xl text-center"
            >
              {/* Pulsing avatar */}
              <div className="relative mx-auto w-20 h-20 mb-6">
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ repeat: Infinity, duration: 1.5 }}
                  className="absolute inset-0 bg-green-100 rounded-full"
                />
                <div className="relative w-20 h-20 bg-green-500 rounded-full flex items-center justify-center">
                  <PhoneIncoming size={32} className="text-white" />
                </div>
              </div>

              <p className="text-sm text-zinc-500 mb-1">Incoming call from</p>
              <h3 className="text-xl font-bold text-zinc-900 mb-1">{incomingCallerName}</h3>
              <p className="text-xs text-zinc-400 mb-8 capitalize">{recipientRole.toLowerCase()}</p>

              <div className="flex items-center justify-center gap-6">
                {/* Reject */}
                <button
                  onClick={handleRejectCall}
                  className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center shadow-lg hover:bg-red-600 transition-colors"
                  title="Decline"
                >
                  <X size={28} className="text-white" />
                </button>

                {/* Accept */}
                <button
                  onClick={handleAcceptCall}
                  className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center shadow-lg hover:bg-green-600 transition-colors"
                  title="Answer"
                >
                  <Phone size={28} className="text-white" />
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default InAppCall;

import React, { useState, useEffect, useRef, useCallback } from 'react';
import styled from 'styled-components';
import Header from '../components/Header';
import io, { Socket } from 'socket.io-client';
import './SimplifiedChat.css';

// Total videos count constant
const TOTAL_VIDEOS = 43;

// Configuration for WebRTC
const rtcConfig: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'stun:stun5.l.google.com:19302' },
    // Add TURN servers for better NAT traversal
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    // Additional reliable TURN servers
    {
      urls: 'turn:global.turn.twilio.com:3478?transport=udp',
      username: 'f4b4035eaa76f4a55de5f4351567653ee4ff6fa97b50b6b334a2cebc8b250621',
      credential: 'w1WpauIZ6mkQ6K+G0vgvzBnMoFtF7t0FMnqQ+q+1Cjk='
    },
    {
      urls: 'turn:global.turn.twilio.com:3478?transport=tcp',
      username: 'f4b4035eaa76f4a55de5f4351567653ee4ff6fa97b50b6b334a2cebc8b250621',
      credential: 'w1WpauIZ6mkQ6K+G0vgvzBnMoFtF7t0FMnqQ+q+1Cjk='
    }
  ],
  iceCandidatePoolSize: 10,
  bundlePolicy: 'max-bundle' as RTCBundlePolicy,
  rtcpMuxPolicy: 'require' as RTCRtcpMuxPolicy,
  iceTransportPolicy: 'all' // Try 'relay' if connections fail
};

interface InitializeMediaStreamProps {
  setLocalStream: React.Dispatch<React.SetStateAction<MediaStream | null>>;
  setConnectionStatus: React.Dispatch<React.SetStateAction<string>>;
}

// Types
type Message = {
  text: string;
  isUser: boolean;
};

const SimplifiedChat: React.FC = () => {
  // State and refs
  const [isSearchingForPartner, setIsSearchingForPartner] = useState<boolean>(false);
  const [isRealPartner, setIsRealPartner] = useState<boolean>(false);
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const partnerIdRef = useRef<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const strangerVideoRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const [isActiveConnection, setIsActiveConnection] = useState<boolean>(false);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState<string>('');
  const partnerConnectionTimeout = useRef<NodeJS.Timeout | null>(null);
  const [userId, setUserId] = useState<string>('');
  const connectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [socketConnected, setSocketConnected] = useState<boolean>(false);
  const [connectionStatus, setConnectionStatus] = useState<string>('disconnected');
  
  // Define server URL with default value
  const socketServerUrl: string = process.env.REACT_APP_SOCKET_SERVER_URL || 'http://localhost:3001';
  
  // Function to clean up peer connection and related resources
  const cleanupPeerConnection = useCallback(() => {
    console.log("Cleaning up peer connection");
    
    // Close all tracks first if peer connection exists
    if (peerConnectionRef.current) {
      try {
        // Stop all senders (local tracks)
        peerConnectionRef.current.getSenders().forEach(sender => {
          if (sender.track) {
            sender.track.stop();
          }
        });
        
        // Close the connection
        peerConnectionRef.current.close();
      } catch (error) {
        console.error("Error closing peer connection:", error);
      } finally {
        peerConnectionRef.current = null;
      }
    }
    
    // Stop local stream tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        track.stop();
      });
      localStreamRef.current = null;
    }
    
    // Reset video elements
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    
    if (strangerVideoRef.current) {
      strangerVideoRef.current.srcObject = null;
    }
  }, []);
  
  // Handle partner disconnection more robustly
  const handlePartnerDisconnect = useCallback(() => {
    console.log("Handling partner disconnect");
    
    // Update UI state
    setIsRealPartner(false);
    setIsActiveConnection(false);
    setPartnerId(null);
    partnerIdRef.current = null;
    setIsConnecting(false);
    setConnectionStatus("Partner disconnected. Click 'New Chat' to find a new partner.");
    
    // Clean up WebRTC connection
    cleanupPeerConnection();
    
    // Clear any timeouts
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }
    
    if (partnerConnectionTimeout.current) {
      clearTimeout(partnerConnectionTimeout.current);
      partnerConnectionTimeout.current = null;
    }
  }, [cleanupPeerConnection]);
  
  // Create peer connection with ICE servers
  const createPeerConnection = useCallback((isInitiator: boolean) => {
    console.log("Creating new peer connection, initiator:", isInitiator);
    
    // Ensure we have active media tracks before creating connection
    if (!localStreamRef.current) {
      console.error('No local stream available, cannot create peer connection');
      return null;
    }
    
    try {
      // Create peer connection with ICE servers
      const peerConnection = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          { urls: 'stun:stun3.l.google.com:19302' },
          { urls: 'stun:stun4.l.google.com:19302' },
          {
            urls: 'turn:openrelay.metered.ca:80',
            username: 'openrelayproject',
            credential: 'openrelayproject'
          },
          {
            urls: 'turn:openrelay.metered.ca:443',
            username: 'openrelayproject',
            credential: 'openrelayproject'
          }
        ],
        iceCandidatePoolSize: 10
      });
      
      // Log track information for debugging
      const videoTracks = localStreamRef.current.getVideoTracks();
      const audioTracks = localStreamRef.current.getAudioTracks();
      
      console.log(`Adding tracks to peer connection: ${videoTracks.length} video, ${audioTracks.length} audio`);
      
      // Add all tracks from our stream to the peer connection
      localStreamRef.current.getTracks().forEach(track => {
        if (track.readyState === 'live') {
          console.log(`Adding ${track.kind} track to peer connection`);
          peerConnection.addTrack(track, localStreamRef.current!);
        } else {
          console.warn(`Track ${track.kind} not in live state, skipping`);
        }
      });
      
      // Set up ICE candidate handling
      peerConnection.onicecandidate = (event) => {
        if (event.candidate && socketRef.current) {
          console.log(`New ICE candidate generated: ${event.candidate.candidate.substring(0, 50)}...`);
          socketRef.current.emit('signal', {
            type: 'candidate',
            to: partnerIdRef.current,
            candidate: event.candidate
          });
        } else if (!event.candidate) {
          console.log('ICE candidate gathering complete');
        }
      };
      
      // Handle incoming remote streams
      peerConnection.ontrack = (event) => {
        console.log(`Remote track added: ${event.track.kind}`);
        
        if (event.streams && event.streams[0]) {
          console.log(`Setting remote stream to video element, tracks: ${event.streams[0].getTracks().length}`);
          
          if (strangerVideoRef.current) {
            strangerVideoRef.current.srcObject = event.streams[0];
            
            // Attempt to play the remote video
            strangerVideoRef.current.play()
              .then(() => {
                console.log("Remote video playing successfully");
                setConnectionStatus("Connected to partner");
                setIsConnecting(false);
                setIsActiveConnection(true);
              })
              .catch(err => {
                console.error("Error playing remote video:", err);
                
                // Try with muted as a workaround for autoplay restrictions
                if (err.name === 'NotAllowedError' && strangerVideoRef.current) {
                  console.log("Autoplay blocked, trying with muted");
                  strangerVideoRef.current.muted = true;
                  
                  strangerVideoRef.current.play()
                    .then(() => {
                      console.log("Remote video playing with muted workaround");
                      // Unmute after a short delay to work around autoplay restrictions
                      setTimeout(() => {
                        if (strangerVideoRef.current) {
                          strangerVideoRef.current.muted = false;
                          console.log("Unmuted remote video after autoplay");
                        }
                      }, 1000);
                    })
                    .catch(innerErr => {
                      console.error("Still couldn't play remote video:", innerErr);
                    });
                }
              });
          }
        } else {
          console.warn("Received track but no stream object");
        }
      };
      
      // Log connection state changes for debugging
      peerConnection.oniceconnectionstatechange = () => {
        console.log(`ICE connection state changed to: ${peerConnection.iceConnectionState}`);
        
        if (peerConnection.iceConnectionState === 'connected' || 
            peerConnection.iceConnectionState === 'completed') {
          console.log("ICE connection established successfully");
          setConnectionStatus(`Connected to partner`);
          setIsConnecting(false);
          setIsActiveConnection(true);
          
          // Clear connection timeout if it exists
          if (connectionTimeoutRef.current) {
            clearTimeout(connectionTimeoutRef.current);
            connectionTimeoutRef.current = null;
          }
        } else if (peerConnection.iceConnectionState === 'failed' || 
                   peerConnection.iceConnectionState === 'disconnected' ||
                   peerConnection.iceConnectionState === 'closed') {
          console.warn(`ICE connection in problematic state: ${peerConnection.iceConnectionState}`);
          setConnectionStatus(`Connection issue: ${peerConnection.iceConnectionState}. Try "New Chat"`);
          
          // Handle failure after a short delay to allow for recovery
          if (peerConnection.iceConnectionState === 'failed') {
            setTimeout(() => {
              if (peerConnectionRef.current && 
                  (peerConnectionRef.current.iceConnectionState === 'failed' || 
                   peerConnectionRef.current.iceConnectionState === 'disconnected')) {
                handlePartnerDisconnect();
              }
            }, 5000);
          }
        }
      };
      
      // Handle connection failures
      peerConnection.onicecandidateerror = (event) => {
        console.error("ICE candidate error:", event);
      };
      
      // Save the peer connection reference
      peerConnectionRef.current = peerConnection;
      
      return peerConnection;
    } catch (error) {
      console.error("Error creating peer connection:", error);
      setErrorMessage(`WebRTC setup failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return null;
    }
  }, [handlePartnerDisconnect]);
  
  // Connect to partner using WebRTC
  const connectToPartner = useCallback(async (partnerId: string, initiator: boolean) => {
    console.log(`Connecting to partner ${partnerId}, initiator: ${initiator}`);
    partnerIdRef.current = partnerId;
    setPartnerId(partnerId);
    setIsConnecting(true);
    setConnectionStatus("Connecting to partner...");
    
    // Validate socket connection
    if (!socketRef.current || socketRef.current.disconnected) {
      console.error("Socket not connected, cannot signal partner");
      setConnectionStatus("Connection error. Please refresh the page.");
      return;
    }
    
    try {
      // Clean up any existing connection
      cleanupPeerConnection();
      
      // Make sure we have camera access
      if (!localStreamRef.current) {
        console.log('No local stream, requesting camera access...');
        
        try {
          // Request camera/mic access
          const stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
          });
          
          console.log("Camera/mic access granted");
          localStreamRef.current = stream;
          
          // Display local video
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
            localVideoRef.current.muted = true;
          }
          
          // Now proceed with connection setup
          setupConnection();
        } catch (err) {
          console.error("Failed to get camera/mic access:", err);
          setConnectionStatus("Camera/mic access denied. Please allow access and try again.");
          return;
        }
      } else {
        // If we have camera access, proceed with connection
        console.log("Already have local stream, setting up connection");
        setupConnection();
      }
    } catch (err) {
      console.error("Error in connectToPartner:", err);
      setConnectionStatus("Connection failed. Please try again.");
      cleanupPeerConnection();
    }
    
    // Setup connection function
    function setupConnection() {
      // Create new peer connection
      const pc = createPeerConnection(initiator);
      if (!pc) {
        console.error("Failed to create peer connection");
        setConnectionStatus("WebRTC not supported. Please try a different browser.");
        return;
      }
      
      // Set up a timeout to clean up stalled connections
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
      }
      
      connectionTimeoutRef.current = setTimeout(() => {
        if (peerConnectionRef.current && peerConnectionRef.current.iceConnectionState !== 'connected' && 
            peerConnectionRef.current.iceConnectionState !== 'completed') {
          console.log("Connection timeout - cleaning up");
          setConnectionStatus("Connection timed out. Click 'New Chat' to try again.");
          cleanupPeerConnection();
          setIsConnecting(false);
        }
      }, 30000); // 30 second timeout
      
      // If we're the initiator, create and send an offer
      if (initiator) {
        console.log("Creating offer as initiator");
        
        pc.createOffer()
          .then(offer => {
            console.log("Setting local description (offer)");
            return pc.setLocalDescription(offer);
          })
          .then(() => {
            // Only send the offer once ICE gathering is complete
            const waitForIceGathering = new Promise<void>((resolve) => {
              if (pc.iceGatheringState === 'complete') {
                console.log("ICE gathering already complete");
                resolve();
                return;
              }
              
              // Set a timeout for ICE gathering
              const iceGatheringTimeout = setTimeout(() => {
                console.log("ICE gathering timed out, sending what we have");
                resolve();
              }, 5000);
              
              pc.addEventListener('icegatheringstatechange', () => {
                if (pc.iceGatheringState === 'complete') {
                  console.log("ICE gathering complete");
                  clearTimeout(iceGatheringTimeout);
                  resolve();
                }
              });
            });
            
            return waitForIceGathering;
          })
          .then(() => {
            // Now send the offer with all ICE candidates
            if (pc.localDescription) {
              console.log("Sending offer to partner", partnerId);
              socketRef.current?.emit('signal', {
                type: 'offer',
                to: partnerId,
                description: pc.localDescription
              });
            }
          })
          .catch(err => {
            console.error("Error creating/sending offer:", err);
            setConnectionStatus("Failed to create connection. Please try again.");
            cleanupPeerConnection();
          });
      }
    }
  }, [cleanupPeerConnection, createPeerConnection]);
  
  // Handle incoming WebRTC signals
  const handleSignal = useCallback(async (data: any) => {
    console.log(`Received signal of type: ${data.type} from ${data.from}`);
    
    // Ensure we recognize the partner who's signaling us
    if (partnerIdRef.current !== data.from) {
      console.warn(`Ignoring signal from unknown partner: ${data.from}`);
      return;
    }
    
    try {
      // Handle different signal types
      if (data.type === 'offer') {
        console.log(`Received offer from ${data.from}`);
        handleOffer(data);
      } else if (data.type === 'answer') {
        console.log(`Received answer from ${data.from}`);
        handleAnswer(data);
      } else if (data.type === 'candidate') {
        console.log(`Received ICE candidate from ${data.from}`);
        handleCandidate(data);
      } else {
        console.warn(`Unrecognized signal type: ${data.type}`);
      }
    } catch (error) {
      console.error('Error handling WebRTC signal:', error);
      setConnectionStatus('Connection error. Please try again.');
    }
  }, []);
  
  // Handle incoming WebRTC offer
  const handleOffer = useCallback(async (data: any) => {
    console.log(`Processing offer from ${data.from}`);
    
    // Make sure we have a clean connection
    cleanupPeerConnection();
    
    // Ensure we have camera access
    if (!localStreamRef.current) {
      try {
        console.log('Requesting camera/mic for answering call');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true
        });
        
        localStreamRef.current = stream;
        
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          localVideoRef.current.muted = true;
        }
      } catch (err) {
        console.error('Failed to get media for answering call:', err);
        setConnectionStatus('Camera access denied. Please allow access and try again.');
        return;
      }
    }
    
    // Create a new peer connection
    const pc = createPeerConnection(false); // false since we're the answerer
    if (!pc) {
      console.error('Failed to create peer connection for answering');
      return;
    }
    
    try {
      // Set the remote description from the offer
      const remoteDesc = new RTCSessionDescription(data.description);
      console.log('Setting remote description from offer');
      await pc.setRemoteDescription(remoteDesc);
      
      // Create an answer
      console.log('Creating answer');
      const answer = await pc.createAnswer();
      
      // Set our local description
      console.log('Setting local description (answer)');
      await pc.setLocalDescription(answer);
      
      // Wait for ICE gathering
      const waitForIceGathering = new Promise<void>((resolve) => {
        if (pc.iceGatheringState === 'complete') {
          resolve();
          return;
        }
        
        // Set a timeout for ICE gathering
        const iceGatheringTimeout = setTimeout(() => {
          console.log('ICE gathering timed out, sending what we have');
          resolve();
        }, 5000);
        
        pc.addEventListener('icegatheringstatechange', () => {
          if (pc.iceGatheringState === 'complete') {
            console.log('ICE gathering complete for answer');
            clearTimeout(iceGatheringTimeout);
            resolve();
          }
        });
      });
      
      await waitForIceGathering;
      
      // Send the answer
      console.log('Sending answer to', data.from);
      socketRef.current?.emit('signal', {
        type: 'answer',
        to: data.from,
        description: pc.localDescription
      });
    } catch (err) {
      console.error('Error creating/sending answer:', err);
      cleanupPeerConnection();
    }
  }, [cleanupPeerConnection, createPeerConnection]);
  
  // Handle incoming WebRTC answer
  const handleAnswer = useCallback(async (data: any) => {
    console.log(`Processing answer from ${data.from}`);
    
    if (!peerConnectionRef.current) {
      console.error('Received answer but no peer connection exists');
      return;
    }
    
    try {
      const remoteDesc = new RTCSessionDescription(data.description);
      console.log('Setting remote description from answer');
      await peerConnectionRef.current.setRemoteDescription(remoteDesc);
      console.log('Remote description set successfully');
    } catch (err) {
      console.error('Error setting remote description from answer:', err);
      cleanupPeerConnection();
    }
  }, [cleanupPeerConnection]);
  
  // Handle incoming ICE candidate
  const handleCandidate = useCallback(async (data: any) => {
    console.log(`Processing ICE candidate from ${data.from}`);
    
    if (!peerConnectionRef.current) {
      console.warn('Received ICE candidate but no peer connection exists');
      return;
    }
    
    try {
      // Add the ICE candidate
      const candidate = new RTCIceCandidate(data.candidate);
      await peerConnectionRef.current.addIceCandidate(candidate);
      console.log('ICE candidate added successfully');
    } catch (err) {
      console.error('Error adding ICE candidate:', err);
    }
  }, []);
  
  // Socket connection effect
  useEffect(() => {
    // Set up the socket connection when component mounts
    console.log("Connecting to socket server...");
    
    const socket = io(socketServerUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });
    
    // Save socket reference
    socketRef.current = socket;
    
    // Socket connection events
    socket.on('connect', () => {
      console.log("Socket connected with ID:", socket.id);
      setUserId(socket.id || '');
      setConnectionStatus('Connected to server');
      setSocketConnected(true);
    });
    
    socket.on('disconnect', () => {
      console.log("Socket disconnected");
      setSocketConnected(false);
      setConnectionStatus('Disconnected from server. Reconnecting...');
      cleanupPeerConnection();
    });
    
    socket.on('reconnect', () => {
      console.log("Socket reconnected");
      setSocketConnected(true);
      setConnectionStatus('Connected to server');
    });
    
    socket.on('error', (error: any) => {
      console.error("Socket error:", error);
      setConnectionStatus('Connection error. Please refresh the page.');
    });
    
    // Partner matching events
    socket.on('partner_found', (data: { partnerId: string, isInitiator: boolean }) => {
      console.log(`Partner found: ${data.partnerId}. isInitiator: ${data.isInitiator}`);
      setPartnerId(data.partnerId);
      partnerIdRef.current = data.partnerId;
      setIsRealPartner(true);
      setConnectionStatus('Partner found! Establishing connection...');
      
      // Connect to partner with WebRTC
      connectToPartner(data.partnerId, data.isInitiator);
    });
    
    socket.on('partner_disconnected', () => {
      console.log("Received partner_disconnected event");
      handlePartnerDisconnect();
    });
    
    // WebRTC signaling events
    socket.on('signal', (data: any) => {
      console.log(`Received signal: ${data.type} from ${data.from}`);
      handleSignal(data);
    });
    
    // Clean up socket connection on component unmount
    return () => {
      console.log("Component unmounting, cleaning up socket");
      cleanupPeerConnection();
      
      socket.disconnect();
      socketRef.current = null;
    };
  }, [cleanupPeerConnection, connectToPartner, handlePartnerDisconnect, handleSignal, socketServerUrl]);

  // Function to send a message to the partner
  const sendMessage = useCallback(() => {
    if (inputMessage.trim() === '') return;
    
    // Add message to local state immediately
    setMessages(prev => [...prev, { text: inputMessage, isUser: true }]);
    const messageToSend = inputMessage;
    setInputMessage(''); // Clear input field immediately
    
    // If connected to a real partner, send via socket
    if (isRealPartner && socketRef.current && socketRef.current.connected) {
      // Check if we have a partner ID
      if (partnerId) {
        console.log('Sending message to partner via WebSocket:', partnerId);
        socketRef.current.emit('send_message', { 
          to: partnerId, // Use the actual partner ID
          message: messageToSend
        });
      } else {
        console.warn('Cannot send message: no partner ID available');
      }
    } else {
      console.log('Not sending message: no real partner or socket disconnected');
    }
  }, [inputMessage, isRealPartner, partnerId]);
  
  // Handle message input with Enter key
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      sendMessage();
    }
  }, [sendMessage]);
  
  // Handle starting a new chat with a different partner
  const handleStartNewChat = useCallback(() => {
    console.log("Starting new chat");
    
    // First clean up existing connection
    cleanupPeerConnection();
    
    // Reset state
    setIsSearchingForPartner(true);
    setIsRealPartner(false);
    setMessages([]);
    setIsActiveConnection(false);
    setIsConnecting(true);
    setConnectionStatus("Searching for partner...");
    
    // Connect to new partner
    if (socketRef.current) {
      console.log("Sending find_partner request");
      socketRef.current.emit("find_partner", {});
    }
  }, [cleanupPeerConnection]);

  return (
    <div className="chat-container">
      <div className="connection-status">
        Status: {connectionStatus}
        {errorMessage && <div className="error-message">{errorMessage}</div>}
      </div>
      
      <div className="video-container">
        <video ref={localVideoRef} autoPlay playsInline muted className="local-video" />
        <video ref={strangerVideoRef} autoPlay playsInline className="stranger-video" />
      </div>
      
      <div className="controls">
        <button onClick={handleStartNewChat} disabled={isConnecting}>
          {isSearchingForPartner ? "Stop Searching" : "New Chat"}
        </button>
      </div>
      
      <div className="chat-messages">
        {messages.map((msg, index) => (
          <div key={index} className={`message ${msg.isUser ? 'user' : 'partner'}`}>
            {msg.text}
          </div>
        ))}
      </div>
      
      <div className="chat-input">
        <input
          type="text"
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          disabled={!isRealPartner || !isActiveConnection}
        />
        <button 
          onClick={sendMessage}
          disabled={!isRealPartner || !isActiveConnection}
        >
          Send
        </button>
      </div>
    </div>
  );
};

// Styled components
const ChatContainer = styled.div`
  display: flex;
  height: calc(100vh - 80px);
  width: 100%;
  background-color: white;
`;

const MainContainer = styled.div`
  display: flex;
  height: calc(100vh - 80px);
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
`;

const LeftSection = styled.div`
  flex: 0.8;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
  background-color: white;
  border-right: 1px solid #e5e5e5;
  padding: 20px;
  gap: 10px;
`;

const RightSection = styled.div`
  flex: 1.2;
  display: flex;
  flex-direction: column;
  padding: ${({ theme }) => theme.spacing.md};
  background-color: white;
`;

const VideoScreen = styled.div<{ isTop?: boolean }>`
  height: calc(50% - 5px);
  overflow: hidden;
  position: relative;
  background-color: #000;
  border: 1px solid #333;
  border-radius: 8px;
  display: flex;
  justify-content: center;
  align-items: center;
`;

const ChatMessages = styled.div`
  flex: 1;
  background-color: white;
  padding: ${({ theme }) => theme.spacing.md};
  overflow-y: auto;
  min-height: 300px;
  display: flex;
  flex-direction: column;
`;

const ChatInputArea = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
  border: 1px solid #e5e5e5;
  margin: ${({ theme }) => theme.spacing.md} 0;
`;

const MessageInput = styled.textarea`
  flex: 1;
  min-height: 60px;
  padding: ${({ theme }) => theme.spacing.sm};
  border: none;
  resize: none;
  font-family: inherit;
  font-size: 1rem;
  outline: none;
`;

const SendButton = styled.button`
  background-color: #09f;
  color: white;
  border: none;
  border-left: 1px solid #e5e5e5;
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  font-size: 0.875rem;
  cursor: pointer;
  align-self: stretch;
  display: flex;
  align-items: center;
  justify-content: center;
  
  &:hover {
    background-color: #007dd1;
  }
`;

const SolmegleWatermark = styled.div`
  position: absolute;
  bottom: 10px;
  left: 10px;
  color: #ff6600;
  font-size: 1.5rem;
  font-weight: 700;
  font-family: Arial, sans-serif;
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.5);
  z-index: 10;
`;

const CameraBlockedSection = styled.div`
  padding: ${({ theme }) => theme.spacing.lg};
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
`;

const CameraBlockedMessage = styled.div`
  font-size: 1rem;
  margin-bottom: ${({ theme }) => theme.spacing.md};
  color: white;
`;

const BottomControls = styled.div`
  margin-top: auto;
  padding: ${({ theme }) => theme.spacing.md};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

const StrangerMessage = styled.div`
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: white;
  font-size: 1rem;
  text-align: center;
`;

const AllowCameraButton = styled.button`
  background-color: #09f;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1rem;
  
  &:hover {
    background-color: #007dd1;
  }
`;

const ControlButton = styled.button<{ primary?: boolean }>`
  background-color: ${({ primary }) => primary ? '#09f' : '#f8f8f8'};
  color: ${({ primary }) => primary ? 'white' : '#333'};
  border: ${({ primary }) => primary ? 'none' : '1px solid #e5e5e5'};
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
  
  &:hover {
    background-color: ${({ primary }) => primary ? '#007dd1' : '#f0f0f0'};
  }
`;

const MessageBubble = styled.div<{ isUser: boolean }>`
  max-width: 70%;
  padding: 10px 14px;
  margin: 8px 0;
  border-radius: 16px;
  background-color: ${({ isUser }) => isUser ? '#09f' : '#f1f1f1'};
  color: ${({ isUser }) => isUser ? 'white' : '#333'};
  align-self: ${({ isUser }) => isUser ? 'flex-end' : 'flex-start'};
  word-wrap: break-word;
`;

const VideoContainer = styled.div`
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
`;

const StrangerVideo = styled.video`
  width: 100%;
  height: 100%;
  object-fit: cover;
  background-color: #000;
  display: block;
  pointer-events: none; /* Prevent user interaction with the video */
  
  /* Hide controls completely */
  &::-webkit-media-controls-panel,
  &::-webkit-media-controls-play-button,
  &::-webkit-media-controls-start-playback-button {
    display: none !important;
    -webkit-appearance: none !important;
  }
  
  /* Additional control hiding */
  &::-webkit-media-controls {
    display: none !important;
  }
  
  &::-webkit-media-controls-enclosure {
    display: none !important;
  }
`;

// Add this new styled component for user's video after the StrangerVideo component
const UserVideo = styled.video`
  width: 100%;
  height: 100%;
  object-fit: cover;
  background-color: #000;
  display: block;
  transform: scaleX(-1); /* Mirror the user's camera for a more natural experience */
  
  /* Hide controls completely */
  &::-webkit-media-controls-panel,
  &::-webkit-media-controls-play-button,
  &::-webkit-media-controls-start-playback-button {
    display: none !important;
    -webkit-appearance: none !important;
  }
  
  /* Additional control hiding */
  &::-webkit-media-controls {
    display: none !important;
  }
  
  &::-webkit-media-controls-enclosure {
    display: none !important;
  }
`;

const LiveIndicator = styled.div`
  position: absolute;
  top: 10px;
  right: 10px;
  background-color: #09f;
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 0.8rem;
  font-weight: 700;
`;

const ConnectionStatus = styled.div`
  position: absolute;
  bottom: 40px;
  left: 10px;
  color: white;
  font-size: 0.8rem;
  background-color: rgba(0, 0, 0, 0.5);
  padding: 3px 8px;
  border-radius: 4px;
  z-index: 10;
`;

export default SimplifiedChat;
import React, { useState, useEffect, useRef, useCallback } from 'react';
import styled from 'styled-components';
import Header from '../components/Header';
import io, { Socket } from 'socket.io-client';

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

const SolmegleChat: React.FC = () => {
  const [isCameraAllowed, setIsCameraAllowed] = useState<boolean>(false);
  const [isSearchingForPartner, setIsSearchingForPartner] = useState<boolean>(false);
  const [currentVideoId, setCurrentVideoId] = useState<number | null>(null);
  const [isRealPartner, setIsRealPartner] = useState<boolean>(false);
  const [messages, setMessages] = useState<{ text: string; isUser: boolean }[]>([]);
  const [inputMessage, setInputMessage] = useState<string>('');
  const userVideoRef = useRef<HTMLVideoElement>(null);
  const strangerVideoRef = useRef<HTMLVideoElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const [waitingUsers, setWaitingUsers] = useState<number>(0);
  const [userId, setUserId] = useState<string>('');
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const userStreamRef = useRef<MediaStream | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<string>('disconnected');
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef<number>(0);
  const maxRetries = 5;
  const videoRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const [isActiveConnection, setIsActiveConnection] = useState<boolean>(false);
  const [peerConnection, setPeerConnection] = useState<RTCPeerConnection | null>(null);
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const partnerConnectionTimeout = useRef<NodeJS.Timeout | null>(null);
  const connectionMonitorRef = useRef<NodeJS.Timeout | null>(null);
  const lastIceCandidateTimeRef = useRef<number>(0);

  // WebRTC helper functions
  const cleanupPeerConnection = useCallback(() => {
    if (peerConnectionRef.current) {
      console.log('Cleaning up peer connection');
      try {
        peerConnectionRef.current.ontrack = null;
        peerConnectionRef.current.onicecandidate = null;
        peerConnectionRef.current.onconnectionstatechange = null;
        peerConnectionRef.current.oniceconnectionstatechange = null;
        
        peerConnectionRef.current.getSenders().forEach(sender => {
          if (sender.track) {
            sender.track.stop();
          }
        });
        
        peerConnectionRef.current.close();
      } catch (err) {
        console.error('Error while cleaning up peer connection:', err);
      }
      
      peerConnectionRef.current = null;
      
      // Clear the stranger video
      if (strangerVideoRef.current) {
        strangerVideoRef.current.srcObject = null;
      }
      
      console.log('WebRTC peer connection cleaned up');
    }
  }, []);

  // Function to get a random video ID
  const getRandomVideoId = useCallback(() => {
    return Math.floor(Math.random() * 43) + 1;
  }, []);

  // Debugging function to check camera status
  const logVideoStatus = useCallback(() => {
    if (userVideoRef.current) {
      const userVideo = userVideoRef.current;
      console.log('User video element:', {
        readyState: userVideo.readyState,
        paused: userVideo.paused,
        height: userVideo.videoHeight,
        width: userVideo.videoWidth,
        hasStream: userVideo.srcObject !== null,
        streamActive: userVideo.srcObject ? (userVideo.srcObject as MediaStream).active : false,
        streamTracks: userVideo.srcObject ? (userVideo.srcObject as MediaStream).getTracks().length : 0
      });
    } else {
      console.log('User video ref is null');
    }
  }, [userVideoRef]);

  // Request camera access function
  const requestCameraAccess = useCallback(() => {
    return new Promise<void>((resolve, reject) => {
      console.log('Requesting camera/mic access');
      
      // Simple constraints for better cross-browser compatibility
      const constraints = {
        video: true,
        audio: true
      };
      
      navigator.mediaDevices.getUserMedia(constraints)
        .then(stream => {
          console.log(`Camera access granted! Got stream with ${stream.getTracks().length} tracks`);
          
          // Stop any existing stream first
          if (userStreamRef.current) {
            userStreamRef.current.getTracks().forEach(track => {
              track.stop();
            });
          }
          
          // Store the new stream
          userStreamRef.current = stream;
          
          // Display our own video
          if (userVideoRef.current) {
            userVideoRef.current.srcObject = stream;
            userVideoRef.current.muted = true; // Mute our own video to prevent feedback
            
            userVideoRef.current.onloadedmetadata = () => {
              userVideoRef.current!.play()
                .then(() => {
                  console.log('Local video playing');
                  setIsCameraAllowed(true);
                  resolve();
                })
                .catch(err => {
                  console.error('Error playing local video:', err);
                  // Still resolve since we have the stream
                  setIsCameraAllowed(true);
                  resolve();
                });
            };
          } else {
            console.warn('User video element not available');
            setIsCameraAllowed(true);
            resolve();
          }
        })
        .catch(error => {
          console.error('Camera access error:', error);
          setIsCameraAllowed(false);
          reject(error);
        });
    });
  }, []);

  // Helper function to find partner
  const findPartner = useCallback((socket: Socket) => {
    console.log("Sending find_partner request with userId:", userId);
    setIsConnecting(true);
    setIsSearchingForPartner(true);
    
    // CRITICAL FIX: Enhanced reliability with confirmation and retry
    try {
      socket.emit("find_partner", userId, (ack: any) => {
        if (ack && ack.success) {
          console.log("Server acknowledged find_partner request");
        } else {
          console.log("No acknowledgement for find_partner, will retry");
          // Retry after a short delay
          setTimeout(() => {
            if (socket.connected) {
              console.log("Retrying find_partner");
              socket.emit("find_partner", userId);
            }
          }, 1000);
        }
      });
    } catch (error) {
      console.error("Error sending find_partner request:", error);
      // Fallback if emit throws an error
      setTimeout(() => {
        if (socket.connected) {
          console.log("Retrying find_partner after error");
          socket.emit("find_partner", userId);
        }
      }, 1000);
    }
  }, [userId]);

  // Enhanced connectToPartner function with ONLY real user connections
  const connectToPartner = useCallback(() => {
    if (!socketRef.current || !userId) {
      console.log("Cannot connect: Socket not initialized or missing userId");
      // Set a flag to try connecting again after socket is initialized
      setIsSearchingForPartner(true);
      setConnectionStatus("Waiting for connection...");
      return;
    }

    // Show searching status
    setIsSearchingForPartner(true);
    setMessages([]);
    setConnectionStatus("Searching for a real partner...");
    setIsConnecting(true);
    
    // Force socket reconnection if it's not connected - critical for reliability
    if (!socketRef.current.connected) {
      console.log("Socket not connected - reconnecting");
      socketRef.current.connect();
      
      // Set a timeout to check if socket reconnected
      setTimeout(() => {
        if (socketRef.current && socketRef.current.connected) {
          console.log("Socket reconnected successfully, now finding partner");
          findPartner(socketRef.current);
        } else {
          console.log("Socket reconnection failed, showing error");
          setConnectionStatus("Connection failed. Please try again.");
          setIsConnecting(false);
        }
      }, 2000);
      
      return;
    }
    
    // Socket is connected, find a partner
    findPartner(socketRef.current);
    
    // Set up interval to regularly check for partners with increased frequency
    const intervalId = setInterval(() => {
      if (socketRef.current && socketRef.current.connected && isSearchingForPartner && !isActiveConnection && !isConnecting) {
        console.log("Still searching for partner...");
        findPartner(socketRef.current);
      } else if (!isSearchingForPartner || isActiveConnection) {
        console.log("Stopping partner search interval");
        clearInterval(intervalId);
      }
    }, 3000); // Check more frequently (every 3 seconds)

    return () => {
      console.log("Cleaning up partner search interval");
      clearInterval(intervalId);
    };
  }, [socketRef, userId, isSearchingForPartner, isActiveConnection, isConnecting, findPartner]);

  // Function to create and return a new RTCPeerConnection
  const createPeerConnection = useCallback((targetUserId: string, isInitiator: boolean) => {
    console.log(`Creating peer connection to ${targetUserId} as ${isInitiator ? 'initiator' : 'responder'}`);
    
    // Cleanup any existing connections
    cleanupPeerConnection();
    
    // CRITICAL FIX: Simplify configuration and ensure it works with mobile networks
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        {
          urls: 'turn:openrelay.metered.ca:80',
          username: 'openrelayproject',
          credential: 'openrelayproject'
        },
        {
          urls: 'turn:global.turn.twilio.com:3478?transport=udp',
          username: 'f4b4035eaa76f4a55de5f4351567653ee4ff6fa97b50b6b334a2cebc8b250621',
          credential: 'w1WpauIZ6mkQ6K+G0vgvzBnMoFtF7t0FMnqQ+q+1Cjk='
        }
      ],
      iceCandidatePoolSize: 10
    });
    
    peerConnectionRef.current = pc;
    
    // Add connection state monitoring
    const connectionMonitor = setInterval(() => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        console.log(`Connection monitor: WebRTC state is ${pc.connectionState}, attempting recovery`);
        
        if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
          console.log('ICE connection failed, trying to restart ICE');
          try {
            // Try to restart ICE
            pc.restartIce();
            console.log('ICE restart initiated');
          } catch (err) {
            console.error('Error restarting ICE:', err);
          }
        }
      }
    }, 5000);
    
    // Store the interval reference for cleanup
    connectionMonitorRef.current = connectionMonitor;
    
    // Add simple connection state logging
    pc.onconnectionstatechange = () => {
      console.log(`Connection state changed to: ${pc.connectionState}`);
      setConnectionStatus(`Connection: ${pc.connectionState}`);
      
      if (pc.connectionState === 'connected') {
        console.log('WebRTC connection established successfully!');
        setIsRealPartner(true);
        setIsActiveConnection(true);
        setIsConnecting(false);
      } else if (pc.connectionState === 'failed') {
        console.warn('WebRTC connection failed, attempting reconnect');
        // Try to restart the connection after a short delay
        setTimeout(() => {
          if (socketRef.current) {
            findPartner(socketRef.current);
          }
        }, 2000);
      }
    };
    
    // Add ICE connection state monitoring for more detailed diagnostics
    pc.oniceconnectionstatechange = () => {
      console.log(`ICE connection state changed to: ${pc.iceConnectionState}`);
      
      if (pc.iceConnectionState === 'disconnected') {
        console.log('ICE disconnected - this may be temporary');
        setConnectionStatus('Connection unstable - trying to recover...');
      } else if (pc.iceConnectionState === 'failed') {
        console.log('ICE connection failed');
        setConnectionStatus('Connection failed - trying to reconnect...');
      } else if (pc.iceConnectionState === 'connected') {
        console.log('ICE connected successfully');
        setConnectionStatus('Connected');
      }
    };
    
    // Make sure we add local stream tracks to the connection
    if (userStreamRef.current) {
      const stream = userStreamRef.current;
      console.log(`Adding ${stream.getTracks().length} local tracks to peer connection`);
      
      stream.getTracks().forEach(track => {
        // Ensure tracks are enabled
        track.enabled = true;
        try {
          pc.addTrack(track, stream);
          console.log(`Added ${track.kind} track to peer connection`);
        } catch (err) {
          console.error(`Error adding track to peer connection:`, err);
        }
      });
    } else {
      console.error("No local stream available when creating peer connection!");
    }
    
    // Handle ICE candidates simply
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log(`Generated ICE candidate`);
        if (socketRef.current && socketRef.current.connected) {
          socketRef.current.emit('webrtc_ice_candidate', {
            candidate: event.candidate,
            to: targetUserId,
            from: userId || socketRef.current.id
          });
        }
      } else {
        console.log('All ICE candidates have been generated');
      }
    };
    
    // Simplified remote track handling
    pc.ontrack = (event) => {
      console.log(`Received remote ${event.track.kind} track`);
      
      if (event.streams && event.streams[0]) {
        const remoteStream = event.streams[0];
        console.log(`Got remote stream with ${remoteStream.getTracks().length} tracks`);
        
        if (strangerVideoRef.current) {
          strangerVideoRef.current.srcObject = remoteStream;
          strangerVideoRef.current.muted = false;
          
          strangerVideoRef.current.onloadedmetadata = () => {
            console.log('Remote video metadata loaded, playing...');
            strangerVideoRef.current!.play()
              .then(() => console.log('Remote video playing'))
              .catch(err => {
                console.error('Error playing remote video:', err);
                // Try with muted if autoplay is blocked
                if (err.name === 'NotAllowedError') {
                  strangerVideoRef.current!.muted = true;
                  return strangerVideoRef.current!.play();
                }
              });
          };
        } else {
          console.warn('Stranger video element not available');
        }
      }
    };
    
    // Create and send offer if we're the initiator
    if (isInitiator) {
      pc.createOffer()
        .then(offer => {
          console.log('Created offer, setting local description');
          return pc.setLocalDescription(offer);
        })
        .then(() => {
          // Wait a moment for ICE gathering before sending
          setTimeout(() => {
            if (pc.localDescription && socketRef.current) {
              console.log('Sending WebRTC offer');
              socketRef.current.emit('webrtc_offer', {
                offer: pc.localDescription,
                to: targetUserId,
                from: userId || socketRef.current.id
              });
            }
          }, 1000);
        })
        .catch(err => console.error('Error creating/sending offer:', err));
    }
    
    return pc;
  }, [userId, cleanupPeerConnection, findPartner]);

  // Handle partner disconnection more robustly
  const handlePartnerDisconnect = () => {
    console.log("Handling partner disconnect");
    
    setIsRealPartner(false);
    setIsActiveConnection(false);
    setPartnerId(null);
    
    // Clean up peer connection
    if (peerConnectionRef.current) {
      // Close all tracks first
      peerConnectionRef.current.getSenders().forEach(sender => {
        if (sender.track) {
          sender.track.stop();
        }
      });
      // Close the connection
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    
    // Reset video element
    if (strangerVideoRef.current) {
      strangerVideoRef.current.srcObject = null;
    }
  };

  // Start new chat with another partner
  const startNewChat = () => {
    console.log("Starting new chat");
    
    // Clear messages and reset state
    setMessages([]);
    
    // Clean up existing connection
    handlePartnerDisconnect();
    
    // Set as not searching initially (will set to true in connectToPartner)
    setIsSearchingForPartner(false);
    setConnectionStatus("Click 'New Chat' to find a partner");
    
    // Connect to new partner
    connectToPartner();
  };

  // Stop searching for partners
  const stopSearching = () => {
    console.log("Stopping search");
    setIsSearchingForPartner(false);
    setIsConnecting(false);
    setConnectionStatus("Search stopped. Click 'New Chat' to find a partner");
    
    // Clear any timeouts
    if (partnerConnectionTimeout.current) {
      clearTimeout(partnerConnectionTimeout.current);
      partnerConnectionTimeout.current = null;
    }
  };

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

  // FIX VIDEO RENDERING: 
  const renderVideoDisplay = () => {
    if (isSearchingForPartner) {
      return (
        <VideoContainer>
          <StrangerVideo 
            autoPlay
            playsInline
            muted
            loop
            src="/static/static.mp4"
            disablePictureInPicture
            controlsList="nodownload nofullscreen noremoteplayback"
          />
          <SolmegleWatermark>Solmegle</SolmegleWatermark>
          <ConnectionStatus>{connectionStatus}</ConnectionStatus>
        </VideoContainer>
      );
    } else if (isRealPartner) {
      return (
        <VideoContainer>
          <StrangerVideo 
            ref={strangerVideoRef} 
            autoPlay
            playsInline
            disablePictureInPicture
            controlsList="nodownload nofullscreen noremoteplayback"
          />
          <LiveIndicator>LIVE</LiveIndicator>
        </VideoContainer>
      );
    } else {
      return (
        <VideoContainer>
          <StrangerVideo 
            autoPlay
            playsInline
            muted
            loop
            src="/static/static.mp4"
            disablePictureInPicture
            controlsList="nodownload nofullscreen noremoteplayback"
          />
          <SolmegleWatermark>Solmegle</SolmegleWatermark>
          <ConnectionStatus>Click "New Chat" to start</ConnectionStatus>
        </VideoContainer>
      );
    }
  };

  // Initialize the socket connection outside of the WebRTC flow to avoid circular dependencies
  useEffect(() => {
    if (!socketRef.current) {
      console.log("Initializing socket connection");
      const newSocket = io(window.location.origin, {
        transports: ['websocket', 'polling'],
        upgrade: true,
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000,
        forceNew: true,
        autoConnect: true
      });
      socketRef.current = newSocket;

      newSocket.on("connect", () => {
        console.log("Socket connected with ID:", newSocket.id);
        setConnectionStatus("Socket connected. Ready to find partners.");
        // Set userId if not already set
        if (newSocket.id && (!userId || userId.trim() === '')) {
          setUserId(newSocket.id);
        }
        
        // Re-emit find_partner if we were searching when connection was lost
        if (isSearchingForPartner && !isActiveConnection) {
          console.log("Reconnected while searching - reinitiating partner search");
          setTimeout(() => {
            findPartner(newSocket);
          }, 1000);
        }
      });
      
      // CRITICAL FIX: Add socket disconnect and reconnect handlers
      newSocket.on("disconnect", (reason) => {
        console.log(`Socket disconnected: ${reason}`);
        setConnectionStatus(`Connection lost: ${reason}. Reconnecting...`);
      });
      
      newSocket.on("reconnect", (attemptNumber) => {
        console.log(`Socket reconnected after ${attemptNumber} attempts`);
        setConnectionStatus("Reconnected to server!");
        
        // Try to reinitiate partner search if we were searching
        if (isSearchingForPartner && !isActiveConnection) {
          console.log("Reconnected while searching - restarting partner search");
          setTimeout(() => {
            findPartner(newSocket);
          }, 1000);
        }
      });
      
      newSocket.on("reconnect_attempt", (attemptNumber) => {
        console.log(`Socket reconnect attempt #${attemptNumber}`);
        setConnectionStatus(`Reconnecting... (attempt ${attemptNumber})`);
      });
      
      newSocket.on("reconnect_error", (error) => {
        console.log(`Socket reconnect error:`, error);
        setConnectionStatus("Reconnection error. Please refresh the page.");
      });
      
      newSocket.on("reconnect_failed", () => {
        console.log(`Socket reconnect failed after all attempts`);
        setConnectionStatus("Reconnection failed. Please refresh the page.");
      });
      
      // CRITICAL FIX: Handle heartbeat to prevent disconnection
      newSocket.on("heartbeat", (data) => {
        // Respond to heartbeat to keep connection alive
        console.log("Received heartbeat from server, responding");
        newSocket.emit("heartbeat_response");
        
        // Check if we need to reconnect
        if (isSearchingForPartner && !isActiveConnection && !isConnecting) {
          console.log("Heartbeat check: still looking for partner");
          findPartner(newSocket);
        }
      });

      newSocket.on("matched", (matchedPartnerId: string) => {
        console.log(`MATCHED EVENT RECEIVED: Matched with partner ${matchedPartnerId}`);
        
        // Update state to show matched
        setConnectionStatus(`Matched with a partner! Setting up connection...`);
        setPartnerId(matchedPartnerId);
        setIsRealPartner(true);
        setIsActiveConnection(true);
        setIsConnecting(false);

        // Since we found a real partner, clear any timeout for video fallback
        if (partnerConnectionTimeout.current) {
          clearTimeout(partnerConnectionTimeout.current);
          partnerConnectionTimeout.current = null;
        }

        // If we don't have camera access yet, get it first
        if (!userStreamRef.current) {
          console.log("No local stream available, requesting camera access first");
          requestCameraAccess()
            .then(() => {
              console.log("Camera access granted, now creating WebRTC connection as initiator");
              // Use setTimeout to ensure state updates have processed
              setTimeout(() => {
                if (peerConnectionRef.current) {
                  console.log("Cleaning up existing peer connection before creating new one");
                  cleanupPeerConnection();
                }
                createPeerConnection(matchedPartnerId, true);
              }, 300);
            })
            .catch(err => {
              console.error("Failed to get camera access after match:", err);
              setConnectionStatus("Camera access denied. Please enable camera and try again.");
            });
        } else {
          console.log("Already have local stream, creating WebRTC connection as initiator");
          // Use setTimeout to ensure state updates have processed
          setTimeout(() => {
            if (peerConnectionRef.current) {
              console.log("Cleaning up existing peer connection before creating new one");
              cleanupPeerConnection();
            }
            createPeerConnection(matchedPartnerId, true);
          }, 300);
        }
      });

      newSocket.on("partner_disconnected", () => {
        console.log("Partner disconnected");
        setConnectionStatus("Your partner disconnected. Click 'New Chat' to find a new partner.");
        handlePartnerDisconnect();
      });

      newSocket.on("waiting_count", (count: number) => {
        console.log(`Waiting users: ${count}`);
        if (count > 0 && !isActiveConnection && isSearchingForPartner) {
          console.log("People are waiting! Attempting to connect again...");
          // Only try to connect again if we're actively searching and not connected
          if (!isConnecting && socketRef.current) {
            findPartner(socketRef.current);
          }
        }
      });

      // Handle incoming WebRTC signaling with better debugging
      newSocket.on("webrtc_offer", async (data: any) => {
        console.log("Received WebRTC offer", data);
        
        try {
          // Save the partner ID from the offer
          setPartnerId(data.from);
          
          if (!peerConnectionRef.current) {
            console.log("Creating new peer connection for offer");
            // We need to create a new peer connection
            if (typeof createPeerConnection === 'function') {
              createPeerConnection(data.from, false);
            } else {
              console.error("createPeerConnection function not available");
              return;
            }
          }
          
          if (!peerConnectionRef.current) {
            throw new Error("Failed to create peer connection for answer");
          }
          
          // Set the remote description from the offer
          await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.offer));
          console.log("Set remote description from offer");
          
          // Create an answer
          const answer = await peerConnectionRef.current.createAnswer();
          await peerConnectionRef.current.setLocalDescription(answer);
          console.log("Created and set local answer");
          
          // Send the answer back
          newSocket.emit("webrtc_answer", {
            from: userId || newSocket.id,
            to: data.from,
            answer: answer
          });
          console.log("Sent answer to", data.from);
        } catch (err) {
          const error = err as Error;
          console.error("Error handling WebRTC offer:", error);
          setConnectionStatus(`Failed to establish connection: ${error.message}. Try 'New Chat'.`);
        }
      });

      newSocket.on("webrtc_answer", async (data: any) => {
        console.log("Received WebRTC answer from", data.from);
        try {
          if (!peerConnectionRef.current) {
            console.error("No peer connection available for setting remote description");
            return;
          }
          
          await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
          console.log("Successfully set remote description from answer");
          setConnectionStatus("Connected to partner");
        } catch (err) {
          const error = err as Error;
          console.error("Error handling WebRTC answer:", error);
          setConnectionStatus(`Connection issue: ${error.message}. Try 'New Chat'.`);
        }
      });

      newSocket.on("webrtc_ice_candidate", async (data: any) => {
        console.log("Received ICE candidate from", data.from);
        if (peerConnectionRef.current && data.candidate) {
          try {
            await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
            console.log("Added ICE candidate successfully");
          } catch (error) {
            console.error("Error adding ICE candidate:", error);
          }
        } else {
          console.warn("Cannot add ICE candidate: No peer connection or missing candidate data");
        }
      });

      newSocket.on("user_message", (message: string) => {
        console.log("Received message:", message);
        setMessages(prev => [...prev, { text: message, isUser: false }]);
      });

      return () => {
        newSocket.disconnect();
      };
    }
  }, [userId, isRealPartner, isSearchingForPartner, isActiveConnection, isConnecting, cleanupPeerConnection, requestCameraAccess]);

  // Start WebRTC connection when we get a match
  useEffect(() => {
    if (partnerId && isRealPartner && socketRef.current && userStreamRef.current) {
      console.log("Starting WebRTC with matched partner", partnerId);
      createPeerConnection(partnerId, true);
    }
  }, [partnerId, isRealPartner, createPeerConnection]);

  // Improved effect to ensure camera access is properly handled
  useEffect(() => {
    console.log("Initial camera access attempt");
    let mounted = true;
    
    // Wait a moment for refs to be available
    const timer = setTimeout(() => {
      if (mounted) {
        requestCameraAccess()
          .then(() => {
            // Automatically connect to a partner as soon as camera is allowed
            if (mounted) {
              console.log("Camera access granted, automatically connecting to partner");
              connectToPartner();
            }
          })
          .catch(error => {
            console.error('Initial camera setup failed:', error);
          });
      }
    }, 500);
      
    // Cleanup function to stop all tracks when component unmounts
    return () => {
      mounted = false;
      clearTimeout(timer);
      
      console.log("Component unmounting, cleaning up camera");
      
      if (userStreamRef.current) {
        userStreamRef.current.getTracks().forEach(track => {
          console.log(`Stopping track: ${track.kind}`);
          track.stop();
        });
        userStreamRef.current = null;
      }
      
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, [requestCameraAccess, connectToPartner]);

  // Additional effect to handle camera stream when refs become available
  useEffect(() => {
    // This effect will run when the component mounts/updates and userVideoRef changes
    if (userStreamRef.current && userVideoRef.current && !userVideoRef.current.srcObject) {
      console.log("User video ref is now available, setting srcObject");
      userVideoRef.current.srcObject = userStreamRef.current;
      
      userVideoRef.current.play()
        .then(() => console.log("User video playing after ref update"))
        .catch(err => console.error("Error playing video after ref update:", err));
    }
  }, [userVideoRef.current]);

  // Add video ended event listener
  useEffect(() => {
    const strangerVideo = strangerVideoRef.current;
    
    const handleVideoEnded = () => {
      // When one video ends, simulate searching for a new partner
      if (!isRealPartner) {
        // Clear all messages for the new session
        setMessages([]);
        
        // Show "searching for partner" message for 5 seconds
        setIsSearchingForPartner(true);
        setCurrentVideoId(null);
        
        // After 5 seconds, show a new video
        setTimeout(() => {
          const nextVideoId = getRandomVideoId();
          console.log(`Connecting to next video: ${nextVideoId}.mp4`);
          setCurrentVideoId(nextVideoId);
          setIsSearchingForPartner(false);
        }, 5000);
      }
    };
    
    if (strangerVideo) {
      strangerVideo.addEventListener('ended', handleVideoEnded);
    }
    
    return () => {
      if (strangerVideo) {
        strangerVideo.removeEventListener('ended', handleVideoEnded);
      }
    };
  }, [isRealPartner, getRandomVideoId]);

  // Add regular status checking
  useEffect(() => {
    if (isCameraAllowed) {
      const interval = setInterval(() => {
        logVideoStatus();
      }, 10000); // Check every 10 seconds
      return () => clearInterval(interval);
    }
  }, [isCameraAllowed, logVideoStatus]);

  // Initiate a connection when the component mounts and camera access is granted
  useEffect(() => {
    if (isCameraAllowed && currentVideoId === null && !isSearchingForPartner) {
      connectToPartner();
    }
  }, [isCameraAllowed, currentVideoId, isSearchingForPartner, connectToPartner]);

  // Add useEffect to scroll to bottom of messages
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (connectionMonitorRef.current) {
        clearInterval(connectionMonitorRef.current);
      }
      cleanupPeerConnection();
    };
  }, [cleanupPeerConnection]);

  return (
    <>
      <Header />
      <ChatContainer>
        <MainContainer>
          <LeftSection>
            <VideoScreen isTop>
              {renderVideoDisplay()}
            </VideoScreen>
            <VideoScreen>
              {/* User's video */}
              {isCameraAllowed ? (
                <VideoContainer>
                  <UserVideo 
                    ref={userVideoRef} 
                    autoPlay 
                    muted 
                    playsInline 
                    onLoadedMetadata={() => console.log("User video metadata loaded")}
                    onPlay={() => console.log("User video started playing")}
                  />
                </VideoContainer>
              ) : (
                <CameraBlockedSection>
                  <CameraBlockedMessage>
                    Camera is blocked. Please allow camera access to use video chat.
                  </CameraBlockedMessage>
                  <AllowCameraButton onClick={() => requestCameraAccess()}>Allow Camera</AllowCameraButton>
                </CameraBlockedSection>
              )}
            </VideoScreen>
          </LeftSection>

          <RightSection>
            <ChatMessages>
              {messages.map((message, index) => (
                <MessageBubble key={index} isUser={message.isUser}>
                  {message.text}
                </MessageBubble>
              ))}
              <div ref={chatContainerRef} />
            </ChatMessages>
            <ChatInputArea>
              <MessageInput 
                placeholder="Type a message..." 
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={!isRealPartner}
              />
              <SendButton onClick={sendMessage} disabled={!isRealPartner}>Send</SendButton>
            </ChatInputArea>
            <BottomControls>
              <ControlButton primary onClick={startNewChat}>New Chat</ControlButton>
            </BottomControls>
          </RightSection>
        </MainContainer>
      </ChatContainer>
    </>
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

export default SolmegleChat;
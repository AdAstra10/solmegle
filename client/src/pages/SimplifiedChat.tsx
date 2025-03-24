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
    }
  ],
  iceCandidatePoolSize: 10,
  bundlePolicy: 'max-bundle' as RTCBundlePolicy,
  rtcpMuxPolicy: 'require' as RTCRtcpMuxPolicy
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
      // Define camera constraints for better quality
      const constraints = {
        video: true, // Simplified to ensure compatibility across browsers
        audio: true
      };

      console.log('Requesting camera/mic access with constraints:', constraints);
      
      navigator.mediaDevices.getUserMedia(constraints)
        .then(stream => {
          console.log("Camera permission granted, tracks:", stream.getTracks().length);
          
          // Store stream reference for WebRTC
          userStreamRef.current = stream;
          
          // Set a small timeout to ensure the ref is available
          setTimeout(() => {
            if (userVideoRef.current) {
              // Stop any existing tracks
              const existingStream = userVideoRef.current.srcObject as MediaStream;
              if (existingStream) {
                existingStream.getTracks().forEach(track => track.stop());
              }
              
              // Set new stream
              userVideoRef.current.srcObject = stream;
              
              console.log("Set user video source to stream");
              setIsCameraAllowed(true);
              resolve();
              
              // Play after a slight delay to ensure DOM is ready
              setTimeout(() => {
                if (userVideoRef.current) {
                  userVideoRef.current.play()
                    .then(() => {
                      console.log("User video is now playing");
                      logVideoStatus();
                    })
                    .catch(err => {
                      console.error("Error playing user video:", err);
                      // Don't reject, just log the error
                    });
                }
              }, 100);
            } else {
              console.warn("User video ref is not available yet, saving stream for later");
              // Still mark camera as allowed since we have the stream
              setIsCameraAllowed(true);
              resolve();
            }
          }, 100);
        })
        .catch(error => {
          console.error('Camera access error:', error);
          setIsCameraAllowed(false);
          reject(error);
        });
    });
  }, [logVideoStatus]);

  // Initialize the socket connection
  useEffect(() => {
    if (!socketRef.current) {
      console.log("Initializing socket connection");
      const newSocket = io(window.location.origin, {
        transports: ['websocket', 'polling'], // Try WebSocket, fallback to polling
        upgrade: true, // Allow transport upgrade
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
      });

      newSocket.on("matched", (matchedPartnerId: string) => {
        console.log(`Matched with partner: ${matchedPartnerId}`);
        setConnectionStatus(`Matched with a partner! Setting up connection...`);
        setPartnerId(matchedPartnerId);
        setIsRealPartner(true);
        setIsActiveConnection(true);

        // Since we found a real partner, clear any timeout for video fallback
        if (partnerConnectionTimeout.current) {
          clearTimeout(partnerConnectionTimeout.current);
          partnerConnectionTimeout.current = null;
        }

        // Start WebRTC process here
        startWebRTC(matchedPartnerId, newSocket, userStreamRef.current);
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
          if (!isConnecting) {
            findPartner(newSocket);
          }
        }
      });

      // Handle incoming WebRTC signaling
      newSocket.on("webrtc_offer", async (data: any) => {
        console.log("Received WebRTC offer", data);
        if (!peerConnectionRef.current) {
          const pc = createPeerConnection(data.from, true);
          setPeerConnection(pc);
          
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
            console.log("Set remote description from offer");
            
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            console.log("Created and set local answer");
            
            newSocket.emit("webrtc_answer", {
              from: userId,
              to: data.from,
              answer: answer
            });
            console.log("Sent answer to", data.from);
          } catch (error) {
            console.error("Error handling WebRTC offer:", error);
            setConnectionStatus("Failed to establish connection. Try 'New Chat'.");
          }
        }
      });

      newSocket.on("webrtc_answer", async (data: any) => {
        console.log("Received WebRTC answer", data);
        if (peerConnectionRef.current) {
          try {
            await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
            console.log("Successfully set remote description from answer");
            setConnectionStatus("Connected to partner");
          } catch (error) {
            console.error("Error handling WebRTC answer:", error);
            setConnectionStatus("Connection issue. Try 'New Chat'.");
          }
        }
      });

      newSocket.on("webrtc_ice_candidate", async (data: any) => {
        console.log("Received ICE candidate");
        if (peerConnectionRef.current) {
          try {
            await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
            console.log("Added ICE candidate successfully");
          } catch (error) {
            console.error("Error adding ICE candidate:", error);
          }
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
  }, [userId, isRealPartner, isSearchingForPartner, isActiveConnection, isConnecting]);

  // Function to create and return a new RTCPeerConnection
  const createPeerConnection = (targetUserId: string, isInitiator: boolean) => {
    console.log("Creating peer connection to", targetUserId);
    
    // Cleanup any existing connections
    cleanupPeerConnection();
    
    // Create new peer connection with simplified config
    const pc = new RTCPeerConnection(rtcConfig);
    peerConnectionRef.current = pc;
    
    // Log connection state changes for debugging
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      console.log(`Connection state changed to: ${state}`);
      setConnectionStatus(state);
      
      if (state === 'connected') {
        console.log('Peers successfully connected!');
        setIsRealPartner(true);
        retryCountRef.current = 0;
      } else if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        console.warn(`Connection state is ${state}, may need to restart`);
        
        if (retryCountRef.current < maxRetries) {
          setConnectionStatus(`Connection ${state}, reconnecting... (${retryCountRef.current + 1}/${maxRetries})`);
          
          if (retryTimeoutRef.current) {
            clearTimeout(retryTimeoutRef.current);
          }
          
          retryTimeoutRef.current = setTimeout(() => {
            retryCountRef.current += 1;
            cleanupPeerConnection();
            
            if (socketRef.current && socketRef.current.connected) {
              console.log(`Retrying connection, attempt ${retryCountRef.current}/${maxRetries}`);
              connectToPartner();
            }
          }, 2000); 
        } else {
          console.error(`Connection failed after ${maxRetries} retries`);
          setConnectionStatus(`Connection failed after ${maxRetries} retries. Please try New Chat.`);
        }
      }
    };
    
    // Add stream to connection FIRST before setting up other handlers
    if (userStreamRef.current) {
      const stream = userStreamRef.current;
      console.log(`Adding stream with ${stream.getTracks().length} tracks to peer connection`);
      
      stream.getTracks().forEach(track => {
        try {
          console.log(`Adding ${track.kind} track to peer connection`);
          pc.addTrack(track, stream);
        } catch (err) {
          console.error(`Error adding ${track.kind} track:`, err);
        }
      });
    } else {
      console.warn("No local stream available when creating peer connection");
      
      // Request camera access and try again
      requestCameraAccess()
        .then(() => {
          if (userStreamRef.current && peerConnectionRef.current) {
            userStreamRef.current.getTracks().forEach(track => {
              peerConnectionRef.current!.addTrack(track, userStreamRef.current!);
            });
            console.log("Added tracks after requesting camera access");
          }
        })
        .catch(err => console.error("Failed to get camera for peer connection:", err));
    }
    
    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log(`Generated ICE candidate for ${targetUserId}`);
        if (socketRef.current && socketRef.current.connected) {
          socketRef.current.emit('webrtc_ice_candidate', {
            candidate: event.candidate,
            to: targetUserId,
            from: userId
          });
        } else {
          console.warn("Socket not connected when trying to send ICE candidate");
        }
      } else {
        console.log('All ICE candidates have been generated');
      }
    };
    
    // Monitor ICE connection state
    pc.oniceconnectionstatechange = () => {
      console.log(`ICE connection state: ${pc.iceConnectionState}`);
      
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        console.log('ICE connection established successfully');
        setConnectionStatus('connected');
      } else if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
        console.warn(`ICE connection problem: ${pc.iceConnectionState}`);
      }
    };
    
    // Handle receiving remote stream with better error handling
    pc.ontrack = (event) => {
      console.log(`Received remote ${event.track.kind} track`);
      
      if (event.streams && event.streams[0]) {
        console.log('Got remote stream with tracks:', event.streams[0].getTracks().length);
        
        if (strangerVideoRef.current) {
          console.log('Setting remote stream to stranger video element');
          strangerVideoRef.current.srcObject = event.streams[0];
          setIsRealPartner(true);
          
          strangerVideoRef.current.onloadedmetadata = () => {
            console.log('Remote video metadata loaded');
            strangerVideoRef.current!.play()
              .then(() => console.log('Remote video playing'))
              .catch(err => console.error('Error playing remote video:', err));
          };
        } else {
          console.warn('Stranger video ref not available for remote stream');
        }
      } else {
        console.warn('Received track event without streams');
      }
    };
    
    // If we're the initiator, create and send an offer
    if (isInitiator) {
      console.log('Creating offer as initiator');
      
      // Use standard options
      pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      })
      .then(offer => {
        console.log('Created offer, setting local description');
        return pc.setLocalDescription(offer);
      })
      .then(() => {
        if (!pc.localDescription) {
          throw new Error("Local description not set");
        }
        
        console.log('Local description set, sending offer');
        if (socketRef.current && socketRef.current.connected) {
          socketRef.current.emit('webrtc_offer', {
            offer: pc.localDescription,
            to: targetUserId,
            from: userId
          });
        } else {
          throw new Error("Socket not connected when trying to send offer");
        }
      })
      .catch(err => {
        console.error('Error creating/sending offer:', err);
        setConnectionStatus(`Error creating offer: ${err.message}`);
      });
    }
    
    return pc;
  };

  // Function to start the WebRTC process
  const startWebRTC = async (targetUserId: string, socket: Socket, stream: MediaStream | null) => {
    console.log("Starting WebRTC with", targetUserId);
    setIsConnecting(true);
    
    if (!stream) {
      console.error("No local stream available");
      setConnectionStatus("Cannot connect without camera/mic access");
      return;
    }
    
    try {
      const pc = createPeerConnection(targetUserId, true);
      setPeerConnection(pc);
      
      // Create and send offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      console.log("Created and set local offer");
      
      socket.emit("webrtc_offer", {
        from: userId,
        to: targetUserId,
        offer: offer
      });
      console.log("Sent offer to", targetUserId);
      
    } catch (error) {
      console.error("Error starting WebRTC:", error);
      setConnectionStatus("Failed to start connection");
      setIsConnecting(false);
    }
  };

  // Enhanced connectToPartner function with ONLY real user connections
  const connectToPartner = useCallback(() => {
    if (!socketRef.current || !userId) {
      console.log("Cannot connect: Socket not initialized or missing userId");
      return;
    }

    // Show searching status
    setIsSearchingForPartner(true);
    setMessages([]);
    setConnectionStatus("Searching for a real partner...");
    
    findPartner(socketRef.current);
    
    // Set up interval to regularly check for partners
    const intervalId = setInterval(() => {
      if (socketRef.current && isSearchingForPartner && !isActiveConnection && !isConnecting) {
        console.log("Still searching for partner...");
        findPartner(socketRef.current);
      } else if (isActiveConnection || !isSearchingForPartner) {
        clearInterval(intervalId);
      }
    }, 5000);

    return () => clearInterval(intervalId);
  }, [socketRef, userId, isSearchingForPartner, isActiveConnection, isConnecting]);

  // Helper function to find partner
  const findPartner = (socket: Socket) => {
    console.log("Sending find_partner request");
    setIsConnecting(true);
    socket.emit("find_partner", userId);
  };

  // Handle partner disconnection
  const handlePartnerDisconnect = () => {
    console.log("Handling partner disconnect");
    
    setIsRealPartner(false);
    setIsActiveConnection(false);
    setPartnerId(null);
    
    // Clean up peer connection
    if (peerConnectionRef.current) {
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
      // Get the partner ID from the active connections on the server
      const activePeerId = peerConnectionRef.current?.connectionState === 'connected' ? 
        true : false;
      
      if (activePeerId) {
        console.log('Sending message to partner via WebSocket');
        socketRef.current.emit('send_message', { 
          to: userId, // The server will find the partner from this
          message: messageToSend
        });
      } else {
        console.warn('Cannot send message: no active peer connection');
      }
    } else {
      console.log('Not sending message: no real partner or socket disconnected');
    }
  }, [inputMessage, isRealPartner, userId]);

  // Handle message input with Enter key
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      sendMessage();
    }
  }, [sendMessage]);

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

  return (
    <>
      <Header />
      <ChatContainer>
        <MainContainer>
          <LeftSection>
            <VideoScreen isTop>
              {/* Stranger's video would go here */}
              {isSearchingForPartner ? (
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
              ) : isRealPartner ? (
                <VideoContainer>
                  <StrangerVideo 
                    ref={strangerVideoRef} 
                    autoPlay
                    playsInline
                    muted={false}
                    disablePictureInPicture
                    controlsList="nodownload nofullscreen noremoteplayback"
                  />
                  <LiveIndicator>LIVE</LiveIndicator>
                </VideoContainer>
              ) : (
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
              )}
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
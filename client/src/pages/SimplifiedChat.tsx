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
    { urls: 'stun:stun5.l.google.com:19302' }
  ],
  iceCandidatePoolSize: 10,
  bundlePolicy: 'max-bundle' as RTCBundlePolicy,
  rtcpMuxPolicy: 'require' as RTCRtcpMuxPolicy
};

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

  // WebRTC helper functions
  const cleanupPeerConnection = useCallback(() => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.ontrack = null;
      peerConnectionRef.current.onicecandidate = null;
      peerConnectionRef.current.onconnectionstatechange = null;
      
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
      
      // Clear the stranger video
      if (strangerVideoRef.current) {
        strangerVideoRef.current.srcObject = null;
      }
      
      console.log('WebRTC peer connection cleaned up');
    }
  }, []);

  const createPeerConnection = useCallback((partnerId: string, isInitiator: boolean) => {
    try {
      console.log(`Creating peer connection with ${partnerId}, initiator: ${isInitiator}`);
      
      // Cleanup any existing connections
      cleanupPeerConnection();
      
      // Create new peer connection
      const pc = new RTCPeerConnection(rtcConfig);
      peerConnectionRef.current = pc;
      
      // Add our stream to the connection
      if (userStreamRef.current) {
        userStreamRef.current.getTracks().forEach(track => {
          pc.addTrack(track, userStreamRef.current!);
        });
      } else {
        console.error("No local stream to add to peer connection");
      }
      
      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          if (socketRef.current) {
            socketRef.current.emit('webrtc_ice_candidate', {
              candidate: event.candidate,
              to: partnerId,
              from: userId
            });
          }
        }
      };
      
      // Handle connection state changes
      pc.onconnectionstatechange = () => {
        console.log(`Connection state changed to: ${pc.connectionState}`);
        if (pc.connectionState === 'connected') {
          console.log('Peers successfully connected!');
          setIsRealPartner(true);
        }
      };
      
      // Handle receiving remote stream
      pc.ontrack = (event) => {
        console.log('Received remote track!', event.streams[0]);
        if (strangerVideoRef.current && event.streams[0]) {
          strangerVideoRef.current.srcObject = event.streams[0];
          setIsRealPartner(true);
          console.log('Set stranger video source to remote stream');
          
          // Ensure the video plays
          strangerVideoRef.current.play()
            .then(() => console.log('Remote video started playing'))
            .catch(err => console.error('Error playing remote video:', err));
        }
      };
      
      // If we're the initiator, create and send an offer
      if (isInitiator) {
        pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true })
          .then(offer => pc.setLocalDescription(offer))
          .then(() => {
            if (socketRef.current) {
              socketRef.current.emit('webrtc_offer', {
                offer: pc.localDescription,
                to: partnerId,
                from: userId
              });
            }
          })
          .catch(err => console.error('Error creating offer:', err));
      }
      
      return pc;
    } catch (error) {
      console.error('Error creating peer connection:', error);
      return null;
    }
  }, [userId, cleanupPeerConnection]);

  // Function to get a random video ID
  const getRandomVideoId = useCallback(() => {
    return Math.floor(Math.random() * 43) + 1;
  }, []);

  // Enhanced connectToPartner function with stronger priority for real users
  const connectToPartner = useCallback(() => {
    // Clear all messages for the new session
    setMessages([]);
    
    // Show static video while searching
    setIsSearchingForPartner(true);
    setCurrentVideoId(null);
    
    // First, attempt to find real users
    if (socketRef.current) {
      console.log('Searching for real partners with high priority...');
      
      // Tell server this is a high priority match request
      socketRef.current.emit('find_partner', {
        userId: userId,
        priority: 'high'
      });
      
      // If no match after 7 seconds, fall back to video
      setTimeout(() => {
        if (isSearchingForPartner && !isRealPartner) {
          console.log('No real partners found within timeout, falling back to video');
          const videoId = getRandomVideoId();
          setCurrentVideoId(videoId);
          setIsRealPartner(false);
          setIsSearchingForPartner(false);
        }
      }, 7000);
    } else {
      // Socket not connected, fall back to video immediately
      console.log('Socket not connected, falling back to video');
      const videoId = getRandomVideoId();
      setCurrentVideoId(videoId);
      setIsRealPartner(false);
      setIsSearchingForPartner(false);
    }
  }, [getRandomVideoId, userId, isRealPartner, isSearchingForPartner]);

  // Initialize socket connection
  useEffect(() => {
    const socket = io(window.location.origin, {
      transports: ['websocket'],
      upgrade: false
    });
    socketRef.current = socket;

    if (!userId) {
      const newUserId = 'user_' + Math.random().toString(36).substr(2, 9);
      setUserId(newUserId);
    }

    socket.on('connect', () => {
      console.log('Connected to server');
    });

    socket.on('waiting_count', (count: number) => {
      setWaitingUsers(count);
      console.log(`Users waiting for match: ${count}`);
    });

    socket.on('matched', (partnerId: string) => {
      console.log(`Matched with user: ${partnerId}`);
      setIsSearchingForPartner(false);
      setIsRealPartner(true);
      setMessages([]);
      
      // Create WebRTC peer connection for the matched partner
      createPeerConnection(partnerId, true);
    });
    
    socket.on('webrtc_offer', async (data: any) => {
      if (!peerConnectionRef.current) {
        createPeerConnection(data.from, false);
      }
      
      try {
        await peerConnectionRef.current?.setRemoteDescription(
          new RTCSessionDescription(data.offer)
        );
        
        const answer = await peerConnectionRef.current?.createAnswer();
        await peerConnectionRef.current?.setLocalDescription(answer);
        
        socket.emit('webrtc_answer', {
          answer,
          to: data.from,
          from: userId
        });
      } catch (error) {
        console.error('Error handling WebRTC offer:', error);
      }
    });
    
    socket.on('webrtc_answer', async (data: any) => {
      try {
        await peerConnectionRef.current?.setRemoteDescription(
          new RTCSessionDescription(data.answer)
        );
        console.log('Successfully set remote description from answer');
      } catch (error) {
        console.error('Error handling WebRTC answer:', error);
      }
    });
    
    socket.on('webrtc_ice_candidate', async (data: any) => {
      try {
        if (data.candidate) {
          await peerConnectionRef.current?.addIceCandidate(
            new RTCIceCandidate(data.candidate)
          );
          console.log('Added ICE candidate from partner');
        }
      } catch (error) {
        console.error('Error handling ICE candidate:', error);
      }
    });

    socket.on('user_message', (message: string) => {
      setMessages(prev => [...prev, { text: message, isUser: false }]);
    });

    socket.on('partner_disconnected', () => {
      console.log('Partner disconnected');
      setIsRealPartner(false);
      cleanupPeerConnection();
      setTimeout(() => {
        connectToPartner();
      }, 3000);
    });

    return () => {
      cleanupPeerConnection();
      socket.disconnect();
    };
  }, [userId, createPeerConnection, connectToPartner, cleanupPeerConnection]);

  // Function to send a message to the partner
  const sendMessage = useCallback(() => {
    if (inputMessage.trim() === '') return;
    
    // Add message to local state
    setMessages(prev => [...prev, { text: inputMessage, isUser: true }]);
    
    // If connected to a real partner, send via socket
    if (isRealPartner && socketRef.current) {
      socketRef.current.emit('send_message', { 
        to: userId, // server will know the partner
        message: inputMessage 
      });
    }
    
    setInputMessage('');
  }, [inputMessage, isRealPartner, userId]);

  // Handle message input with Enter key
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      sendMessage();
    }
  }, [sendMessage]);

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

  // Request camera access as soon as the component mounts
  useEffect(() => {
    // Define camera constraints for better quality
    const constraints = {
      video: true,
      audio: true
    };

    // Check if we already have camera access
    navigator.mediaDevices.getUserMedia(constraints)
      .then(stream => {
        console.log("Camera permission granted, tracks:", stream.getTracks().length);
        
        // Store stream reference for WebRTC
        userStreamRef.current = stream;
        
        if (userVideoRef.current) {
          // Stop any existing tracks
          const existingStream = userVideoRef.current.srcObject as MediaStream;
          if (existingStream) {
            existingStream.getTracks().forEach(track => track.stop());
          }
          
          // Set new stream
          userVideoRef.current.srcObject = stream;
          
          // Ensure video starts playing
          userVideoRef.current.play()
            .then(() => {
              console.log("User video is now playing");
              logVideoStatus();
            })
            .catch(err => {
              console.error("Error playing user video:", err);
            });
        } else {
          console.error("User video ref is null, cannot display camera");
        }
        setIsCameraAllowed(true);
      })
      .catch(error => {
        console.error('Camera access error:', error);
        setIsCameraAllowed(false);
      });
      
    // Cleanup function to stop all tracks when component unmounts
    return () => {
      if (userStreamRef.current) {
        userStreamRef.current.getTracks().forEach(track => track.stop());
        userStreamRef.current = null;
      }
      
      if (userVideoRef.current && userVideoRef.current.srcObject) {
        const stream = userVideoRef.current.srcObject as MediaStream;
        if (stream) {
          stream.getTracks().forEach(track => track.stop());
        }
      }
    };
  }, [logVideoStatus]);

  const requestCameraAccess = useCallback(() => {
    // Define camera constraints for better quality
    const constraints = {
      video: true,
      audio: true
    };

    navigator.mediaDevices.getUserMedia(constraints)
      .then(stream => {
        console.log("Camera permission granted on request, tracks:", stream.getTracks().length);
        
        // Store stream reference for WebRTC
        userStreamRef.current = stream;
        
        if (userVideoRef.current) {
          // Stop any existing tracks
          const existingStream = userVideoRef.current.srcObject as MediaStream;
          if (existingStream) {
            existingStream.getTracks().forEach(track => track.stop());
          }
          
          // Set new stream
          userVideoRef.current.srcObject = stream;
          
          // Ensure video starts playing
          userVideoRef.current.play()
            .then(() => {
              console.log("User video is now playing after explicit request");
              logVideoStatus();
            })
            .catch(err => {
              console.error("Error playing user video:", err);
            });
        } else {
          console.error("User video ref is null, cannot display camera");
        }
        setIsCameraAllowed(true);
      })
      .catch(error => {
        console.error('Error accessing camera:', error);
        setIsCameraAllowed(false);
      });
  }, [logVideoStatus]);
  
  // Fix for camera not showing after page refresh by adding a focus event listener
  useEffect(() => {
    // Function to reinitialize camera when page gets focus
    const handleFocus = () => {
      console.log("Window focused - checking camera status");
      if (isCameraAllowed && (!userVideoRef.current?.srcObject || 
          !(userVideoRef.current?.srcObject as MediaStream)?.active)) {
        console.log("Camera needs to be reinitialized");
        requestCameraAccess();
      }
    };

    // Add focus event listener to window
    window.addEventListener('focus', handleFocus);
    
    // Check camera on mount as well
    handleFocus();
    
    // Clean up
    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [isCameraAllowed, requestCameraAccess]);

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
      }, 5000); // Check every 5 seconds
      return () => clearInterval(interval);
    }
  }, [isCameraAllowed, logVideoStatus]);

  // Modified startNewChat function
  const startNewChat = useCallback(() => {
    if (!isCameraAllowed) {
      requestCameraAccess();
      return;
    }
    // Clear all messages when starting a new chat
    setMessages([]);
    
    // Connect to a new partner (or fallback video)
    connectToPartner();
  }, [isCameraAllowed, requestCameraAccess, setMessages, connectToPartner]);

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
              ) : currentVideoId ? (
                <VideoContainer>
                  <StrangerVideo 
                    ref={strangerVideoRef} 
                    autoPlay
                    playsInline
                    muted={false}
                    src={`/videos/${currentVideoId}.mp4`}
                    disablePictureInPicture
                    controlsList="nodownload nofullscreen noremoteplayback"
                  />
                  <SolmegleWatermark>Solmegle</SolmegleWatermark>
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
                  <AllowCameraButton onClick={requestCameraAccess}>Allow Camera</AllowCameraButton>
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
              />
              <SendButton onClick={sendMessage}>Send</SendButton>
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

export default SolmegleChat;
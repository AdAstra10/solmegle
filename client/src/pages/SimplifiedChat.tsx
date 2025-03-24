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
      setConnectionStatus('searching for partners');
      
      // Make sure userId is a string, not an object
      if (!userId) {
        const newUserId = 'user_' + Math.random().toString(36).substr(2, 9);
        setUserId(newUserId);
        
        // Tell server this is a high priority match request with string userId
        socketRef.current.emit('find_partner', newUserId);
      } else {
        // Tell server this is a high priority match request with string userId
        socketRef.current.emit('find_partner', userId);
      }
      
      // If no match after 10 seconds, fall back to video
      setTimeout(() => {
        if (isSearchingForPartner && !isRealPartner) {
          console.log('No real partners found within timeout, falling back to video');
          setConnectionStatus('no partners found');
          const videoId = getRandomVideoId();
          setCurrentVideoId(videoId);
          setIsRealPartner(false);
          setIsSearchingForPartner(false);
        }
      }, 10000);
    } else {
      // Socket not connected, fall back to video immediately
      console.log('Socket not connected, falling back to video');
      setConnectionStatus('not connected to server');
      const videoId = getRandomVideoId();
      setCurrentVideoId(videoId);
      setIsRealPartner(false);
      setIsSearchingForPartner(false);
    }
  }, [getRandomVideoId, userId, isRealPartner, isSearchingForPartner]);

  // Update the createPeerConnection function
  const createPeerConnection = useCallback((partnerId: string, isInitiator: boolean) => {
    try {
      console.log(`Creating peer connection with ${partnerId}, initiator: ${isInitiator}`);
      
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
          console.log(`Generated ICE candidate for ${partnerId}`);
          if (socketRef.current && socketRef.current.connected) {
            socketRef.current.emit('webrtc_ice_candidate', {
              candidate: event.candidate,
              to: partnerId,
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
              to: partnerId,
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
    } catch (error) {
      console.error('Error creating peer connection:', error);
      setConnectionStatus(`Connection error: ${error instanceof Error ? error.message : 'unknown'}`);
      return null;
    }
  }, [userId, cleanupPeerConnection, requestCameraAccess, connectToPartner, maxRetries]);

  // Fix for camera not showing after page refresh or tab focus
  useEffect(() => {
    // Function to reinitialize camera when page gets focus
    const handleFocus = () => {
      console.log("Window focused - checking camera status");
      
      if (isCameraAllowed) {
        // Check if camera stream is missing or inactive
        if (!userVideoRef.current?.srcObject || 
            !(userVideoRef.current?.srcObject as MediaStream)?.active ||
            (userVideoRef.current?.srcObject as MediaStream)?.getTracks().some(track => !track.enabled || track.muted)) {
          
          console.log("Camera needs to be reinitialized after focus");
          // Try to reuse existing stream if possible
          if (userStreamRef.current && userStreamRef.current.active) {
            console.log("Reusing existing active stream");
            if (userVideoRef.current) {
              userVideoRef.current.srcObject = userStreamRef.current;
              userVideoRef.current.play()
                .then(() => console.log("Video playing after focus with existing stream"))
                .catch(err => console.error("Error playing video after focus:", err));
            }
          } else {
            // Request new camera access if stream is inactive
            requestCameraAccess()
              .catch(error => {
                console.error('Camera reinitialization failed:', error);
              });
          }
        } else {
          console.log("Camera is already active after focus");
        }
      }
    };

    // Add focus event listener to window
    window.addEventListener('focus', handleFocus);
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        console.log("Page visibility changed to visible");
        setTimeout(handleFocus, 300); // Small delay for browser to settle
      }
    });
    
    // Clean up
    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('visibilitychange', handleFocus);
    };
  }, [isCameraAllowed, requestCameraAccess]);

  // Initialize socket connection with better reconnection handling
  useEffect(() => {
    // Generate a persistent userId if not already set
    if (!userId) {
      const newUserId = 'user_' + Math.random().toString(36).substr(2, 9);
      console.log('Setting new userId:', newUserId);
      setUserId(newUserId);
    }
    
    console.log('Initializing socket connection with userId:', userId);
    
    // Handle socket disconnection more gracefully
    let disconnectTimer: NodeJS.Timeout | null = null;
    
    // Create socket connection with better error handling
    const socket = io(window.location.origin, {
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
    
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Connected to server with socket id:', socket.id);
      setConnectionStatus('connected to server');
      
      // Clear any pending disconnection timer
      if (disconnectTimer) {
        clearTimeout(disconnectTimer);
        disconnectTimer = null;
      }
    });
    
    socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      setConnectionStatus(`server connection error: ${error.message}`);
    });

    socket.on('waiting_count', (count: number) => {
      setWaitingUsers(count);
      console.log(`Users waiting for match: ${count}`);
    });

    socket.on('matched', (partnerId: string) => {
      console.log(`Matched with user: ${partnerId}`);
      setIsSearchingForPartner(false);
      setConnectionStatus('matched, establishing connection');
      setMessages([]);
      
      // Create WebRTC peer connection for the matched partner
      createPeerConnection(partnerId, true);
    });
    
    socket.on('webrtc_offer', async (data: any) => {
      console.log('Received WebRTC offer from:', data.from);
      setConnectionStatus('received connection offer');
      
      try {
        // Create peer connection if it doesn't exist
        let pc = peerConnectionRef.current;
        
        if (!pc) {
          console.log('Creating new peer connection for answer');
          pc = createPeerConnection(data.from, false);
        }
        
        if (!pc) {
          throw new Error("Failed to create peer connection for answer");
        }
        
        // Make sure we have camera access before proceeding
        if (!userStreamRef.current) {
          console.log('Requesting camera access before processing offer');
          await requestCameraAccess();
        }
        
        // Set the remote description from the offer
        const offerDesc = new RTCSessionDescription(data.offer);
        console.log('Setting remote description from offer');
        await pc.setRemoteDescription(offerDesc);
        
        // Create an answer
        console.log('Creating answer');
        const answer = await pc.createAnswer();
        
        // Set local description from the answer
        console.log('Setting local description from answer');
        await pc.setLocalDescription(answer);
        
        // Send the answer back after a slight delay to ensure local description is set
        setTimeout(() => {
          if (socket.connected && pc.localDescription) {
            console.log('Sending answer back to:', data.from);
            socket.emit('webrtc_answer', {
              answer: pc.localDescription,
              to: data.from,
              from: userId
            });
          } else {
            console.error('Cannot send answer: socket disconnected or local description not set');
          }
        }, 500);
      } catch (error) {
        console.error('Error handling WebRTC offer:', error);
        setConnectionStatus(`error handling offer: ${error instanceof Error ? error.message : 'unknown'}`);
        
        // Try to recover by restarting the connection
        setTimeout(() => {
          cleanupPeerConnection();
          if (socket.connected) {
            socket.emit('find_partner', userId);
          }
        }, 2000);
      }
    });
    
    socket.on('webrtc_answer', async (data: any) => {
      console.log('Received WebRTC answer from:', data.from);
      setConnectionStatus('received connection answer');
      
      try {
        const pc = peerConnectionRef.current;
        
        if (!pc) {
          console.error('No peer connection when receiving answer');
          return;
        }
        
        if (!data.answer) {
          console.error('No answer in the data when receiving answer');
          return;
        }
        
        // Set the remote description from the answer
        const answerDesc = new RTCSessionDescription(data.answer);
        await pc.setRemoteDescription(answerDesc);
        
        console.log('Successfully set remote description from answer');
        setConnectionStatus('connecting...');
      } catch (error) {
        console.error('Error handling WebRTC answer:', error);
        setConnectionStatus(`error handling answer: ${error instanceof Error ? error.message : 'unknown'}`);
      }
    });
    
    socket.on('webrtc_ice_candidate', async (data: any) => {
      console.log(`Received ICE candidate from: ${data.from}`);
      
      try {
        const pc = peerConnectionRef.current;
        
        if (!pc) {
          console.error('No peer connection when receiving ICE candidate');
          return;
        }
        
        if (!data.candidate) {
          console.error('No candidate in the data when receiving ICE candidate');
          return;
        }
        
        // Add the ICE candidate
        const candidate = new RTCIceCandidate(data.candidate);
        await pc.addIceCandidate(candidate);
        
        console.log('Added ICE candidate from partner');
      } catch (error) {
        console.error('Error handling ICE candidate:', error);
      }
    });

    socket.on('user_message', (message: string) => {
      console.log('Received message from partner');
      if (message && typeof message === 'string') {
        setMessages(prev => [...prev, { text: message, isUser: false }]);
      }
    });

    socket.on('partner_disconnected', () => {
      console.log('Partner disconnected');
      setIsRealPartner(false);
      setConnectionStatus('partner disconnected');
      cleanupPeerConnection();
      
      // Try to find a new partner after a brief delay
      setTimeout(() => {
        connectToPartner();
      }, 3000);
    });
    
    socket.on('disconnect', (reason) => {
      console.log(`Disconnected from server: ${reason}`);
      setConnectionStatus(`disconnected: ${reason}`);
      
      // Set a timer to clean up if reconnection doesn't happen quickly
      disconnectTimer = setTimeout(() => {
        cleanupPeerConnection();
        
        // Try to reconnect explicitly after a brief delay
        if (!socket.connected) {
          console.log("Attempting to reconnect socket manually");
          socket.connect();
        }
      }, 5000);
    });

    return () => {
      console.log('Cleaning up socket and connection');
      if (disconnectTimer) {
        clearTimeout(disconnectTimer);
      }
      cleanupPeerConnection();
      socket.disconnect();
    };
  }, [userId, createPeerConnection, connectToPartner, cleanupPeerConnection]);

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
  }, [requestCameraAccess]);

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

  // Modified startNewChat function
  const startNewChat = useCallback(() => {
    // First, ensure camera is allowed
    if (!isCameraAllowed) {
      requestCameraAccess()
        .then(() => {
          // Once camera is allowed, connect to a partner
          setMessages([]);
          connectToPartner();
        })
        .catch(error => {
          console.error('Failed to get camera access for new chat:', error);
        });
      return;
    }
    
    // Reset retry count
    retryCountRef.current = 0;
    
    // Clear all messages when starting a new chat
    setMessages([]);
    
    // Cleanup any existing connection
    cleanupPeerConnection();
    
    // Connect to a new partner (or fallback video)
    connectToPartner();
  }, [isCameraAllowed, requestCameraAccess, connectToPartner, cleanupPeerConnection]);

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
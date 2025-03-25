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
    { urls: 'stun:openrelay.metered.ca:80' },
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
    // Twilio TURN servers for greater reliability
    {
      urls: 'turn:global.turn.twilio.com:3478?transport=udp',
      username: 'f4b4035eaa76f4a55de5f4351567653ee4ff6fa97b50b6b334a2cebc8b250621',
      credential: 'w1WpauIZ6mkQ6K+G0vgvzBnMoFtF7t0FMnqQ+q+1Cjk='
    }
  ],
  iceCandidatePoolSize: 10,
  bundlePolicy: 'max-bundle' as RTCBundlePolicy,
  rtcpMuxPolicy: 'require' as RTCRtcpMuxPolicy,
  iceTransportPolicy: 'all'
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
  const [errorMessage, setErrorMessage] = useState<string>('');
  const partnerIdRef = useRef<string | null>(null);
  const [isConnectedToPartner, setIsConnectedToPartner] = useState<boolean>(false);
  const connectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingIceCandidatesRef = useRef<RTCIceCandidate[]>([]);
  const remoteDescriptionSetRef = useRef<boolean>(false);
  const isSignalingInProgressRef = useRef<boolean>(false);
  const lastOfferTimeRef = useRef<number>(0);
  const recoveryAttemptsRef = useRef<number>(0);

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
      
      // CRITICAL FIX: More reliable constraints with fallbacks
      const constraints = {
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: "user"
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true
        }
      };
      
      // If we already have a stream with active tracks, reuse it
      if (userStreamRef.current) {
        const videoTracks = userStreamRef.current.getVideoTracks();
        const audioTracks = userStreamRef.current.getAudioTracks();
        
        // Check if we have active tracks
        if (videoTracks.length > 0 && audioTracks.length > 0 && 
            videoTracks[0].readyState === 'live' && audioTracks[0].readyState === 'live') {
          console.log('Using existing camera stream with active tracks');
          
          if (userVideoRef.current && !userVideoRef.current.srcObject) {
            userVideoRef.current.srcObject = userStreamRef.current;
            userVideoRef.current.muted = true;
          }
          
          setIsCameraAllowed(true);
          resolve();
          return;
        } else {
          console.log('Existing tracks not active, stopping all tracks');
          
          // Stop all existing tracks properly
          userStreamRef.current.getTracks().forEach(track => {
            try {
              track.stop();
              console.log(`Stopped ${track.kind} track: ${track.label}`);
            } catch (err) {
              console.error(`Error stopping ${track.kind} track:`, err);
            }
          });
          
          // Clear the stream reference
          userStreamRef.current = null;
        }
      }
      
      // Define a function to handle stream acquisition
      const acquireStream = () => {
        console.log('Attempting to acquire camera/mic with constraints:', JSON.stringify(constraints));
        
        navigator.mediaDevices.getUserMedia(constraints)
          .then(stream => {
            console.log(`Camera access granted! Got stream with ${stream.getTracks().length} tracks`);
            
            // Save the stream reference
            userStreamRef.current = stream;
            
            // Log detailed track information
            stream.getTracks().forEach(track => {
              console.log(`Track ${track.kind}: ${track.label}, state: ${track.readyState}, enabled: ${track.enabled}`);
              
              // Make sure all tracks are enabled
              track.enabled = true;
              
              // Add track-ended listener to detect when tracks get terminated
              track.onended = () => {
                console.error(`Track ${track.kind} ended unexpectedly, may need to restart camera`);
                
                // If tracks end unexpectedly, we may need to restart the camera access
                // But we need to avoid infinite loops
                if (isCameraAllowed) {
                  requestCameraAccess()
                    .then(() => console.log('Camera reacquired after track ended'))
                    .catch(err => console.error('Failed to reacquire camera after track ended:', err));
                }
              };
            });
            
            // Display our own video
            if (userVideoRef.current) {
              userVideoRef.current.srcObject = stream;
              userVideoRef.current.muted = true; // Mute our own video
              
              userVideoRef.current.onloadedmetadata = () => {
                console.log('Local video metadata loaded, playing...');
                
                userVideoRef.current!.play()
                  .then(() => {
                    console.log('Local video playing successfully');
                    setIsCameraAllowed(true);
                    resolve();
                  })
                  .catch(err => {
                    console.error('Error playing local video:', err);
                    
                    // If autoplay is blocked, try with muted
                    if (err.name === 'NotAllowedError') {
                      console.log('Autoplay blocked, trying with muted');
                      userVideoRef.current!.muted = true;
                      
                      userVideoRef.current!.play()
                        .then(() => {
                          console.log('Local video playing with muted workaround');
                          setIsCameraAllowed(true);
                          resolve();
                        })
                        .catch(playErr => {
                          console.error('Failed to play even with muted:', playErr);
                          // Still consider camera enabled, even if we can't display locally
                          setIsCameraAllowed(true);
                          resolve();
                        });
                    } else {
                      // Still consider camera enabled, even if we can't display locally
                      setIsCameraAllowed(true);
                      resolve();
                    }
                  });
              };
              
              // Add error handler for video element
              userVideoRef.current.onerror = (event) => {
                console.error('Error with user video element:', event);
              };
            } else {
              console.warn('User video element not available');
              setIsCameraAllowed(true);
              resolve();
            }
          })
          .catch(error => {
            console.error('getUserMedia error:', error.name, error.message);
            
            // Try a fallback with just video if audio fails
            if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError' || 
                error.name === 'NotReadableError' || error.name === 'TrackStartError' ||
                error.message.includes('audio')) {
              
              console.log('Trying fallback: video only');
              navigator.mediaDevices.getUserMedia({ video: true })
                .then(videoOnlyStream => {
                  console.log('Video-only fallback succeeded');
                  userStreamRef.current = videoOnlyStream;
                  
                  // Setup video element
                  if (userVideoRef.current) {
                    userVideoRef.current.srcObject = videoOnlyStream;
                    userVideoRef.current.muted = true;
                    
                    userVideoRef.current.onloadedmetadata = () => {
                      userVideoRef.current!.play()
                        .then(() => {
                          console.log('Video-only fallback playing');
                          setIsCameraAllowed(true);
                          resolve();
                        })
                        .catch(err => {
                          console.error('Error playing video-only fallback:', err);
                          setIsCameraAllowed(true);
                          resolve();
                        });
                    };
                  } else {
                    setIsCameraAllowed(true);
                    resolve();
                  }
                })
                .catch(fallbackError => {
                  console.error('Video-only fallback failed:', fallbackError);
                  setIsCameraAllowed(false);
                  reject(fallbackError);
                });
            } else {
              console.error('Camera access denied or error:', error);
              setIsCameraAllowed(false);
              reject(error);
            }
          });
      };
      
      // Get list of devices first to ensure permissions
      navigator.mediaDevices.enumerateDevices()
        .then(devices => {
          console.log('Available devices:', devices.map(d => `${d.kind}: ${d.label}`).join(', '));
          acquireStream();
        })
        .catch(err => {
          console.error('Error enumerating devices:', err);
          // Try direct access if enumeration fails
          acquireStream();
        });
    });
  }, [isCameraAllowed]);

  // Helper function to find partner
  const findPartner = useCallback((socket: Socket) => {
    if (!socket.connected) {
      console.log("Socket not connected, cannot find partner");
      setConnectionStatus("Connection lost. Reconnecting...");
      return;
    }
    
    console.log("Sending find_partner request with socket ID:", socket.id);
    setIsConnecting(true);
    setIsSearchingForPartner(true);
    
    try {
      // Now using empty object as the data; server will use socket.id
      socket.emit("find_partner", {}, (ack: any) => {
        if (ack && ack.success) {
          console.log("Server acknowledged find_partner request");
          setConnectionStatus("Looking for a partner...");
        } else if (ack && ack.error) {
          console.log("Server rejected find_partner request:", ack.error);
          setConnectionStatus(`Server message: ${ack.error}`);
          // Don't retry immediately on rejection
          setTimeout(() => {
            setIsConnecting(false);
          }, 2000);
        } else {
          console.log("No acknowledgement for find_partner, will retry");
          // Retry after a short delay
          setTimeout(() => {
            if (socket.connected) {
              console.log("Retrying find_partner");
              socket.emit("find_partner", {});
            }
          }, 1500);
        }
      });
    } catch (error) {
      console.error("Error sending find_partner request:", error);
      // Fallback if emit throws an error
      setTimeout(() => {
        if (socket.connected) {
          console.log("Retrying find_partner after error");
          socket.emit("find_partner", {});
        }
      }, 2000);
    }
  }, []);

  // Create a WebRTC peer connection with better track handling
  const createPeerConnection = useCallback((isInitiator: boolean): RTCPeerConnection | null => {
    console.log(`Creating peer connection as ${isInitiator ? 'initiator' : 'receiver'}`);
    
    // CRITICAL FIX: Ensure we have active media tracks before creating connection
    if (!userStreamRef.current) {
      console.error('No local stream available, cannot create peer connection');
      
      // Try to request camera access again
      requestCameraAccess()
        .then(() => {
          console.log('Camera access granted after retry in createPeerConnection');
          // Let the socket handler retry peer connection creation
        })
        .catch(err => {
          console.error('Failed to get camera tracks after access granted:', err);
          setErrorMessage('Camera access required to chat. Please allow camera and refresh.');
        });
      
      return null;
    }
    
    // Verify we have valid tracks
    const videoTracks = userStreamRef.current.getVideoTracks();
    const audioTracks = userStreamRef.current.getAudioTracks();
    
    if (videoTracks.length === 0) {
      console.error('No video tracks available in local stream');
      setErrorMessage('No video available. Please check your camera settings and refresh.');
      return null;
    }
    
    if (audioTracks.length === 0) {
      console.warn('No audio tracks available in local stream, continuing with video only');
    }
    
    // Log active track information
    console.log(`Creating peer with ${videoTracks.length} video tracks and ${audioTracks.length} audio tracks`);
    videoTracks.forEach(track => {
      console.log(`Video track: ${track.label}, state: ${track.readyState}, enabled: ${track.enabled}`);
    });
    audioTracks.forEach(track => {
      console.log(`Audio track: ${track.label}, state: ${track.readyState}, enabled: ${track.enabled}`);
    });
    
    // Create and configure the peer connection
    try {
      // STUN and TURN server configuration
      const iceServers = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
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
      ];
      
      const peerConnection = new RTCPeerConnection({
        iceServers,
        iceTransportPolicy: 'all' as RTCIceTransportPolicy,
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require'
      });
      
      // Add event listeners for debugging
      peerConnection.addEventListener('negotiationneeded', (event) => {
        console.log('Negotiation needed event triggered', event);
      });
      
      peerConnection.addEventListener('icecandidate', (event) => {
        if (event.candidate) {
          console.log('ICE candidate generated:', event.candidate.candidate);
          
          // Send the ICE candidate to the peer
          if (socketRef.current && partnerIdRef.current) {
            socketRef.current.emit('ice_candidate', {
              to: partnerIdRef.current,
              candidate: event.candidate
            });
          }
        } else {
          console.log('ICE gathering complete');
        }
      });
      
      peerConnection.addEventListener('icecandidateerror', (event) => {
        console.error('ICE candidate error:', event);
        
        // Use proper type handling for icecandidateerror event 
        // TypeScript doesn't know about all properties on this event
        const errorEvent = event as any;
        const errorCode = errorEvent.errorCode || 0;
        const errorText = errorEvent.errorText || '';
        const hostCandidate = errorEvent.hostCandidate || '';
        const url = errorEvent.url || '';
        
        if (errorCode === 701 || errorText.includes("STUN allocate failed")) {
          console.log("STUN server unreachable, trying alternative servers");
          // Will automatically try other servers, no action needed
        } else if (errorCode === 702 || errorText.includes("TURN allocate failed")) {
          console.log("TURN server auth failed or server unreachable, trying alternatives");
          // Will automatically try other servers, no action needed
        }
        
        // Don't show error to user for ICE candidate errors
        // These are common and usually don't affect the connection if we have other candidates
      });
      
      peerConnection.addEventListener('iceconnectionstatechange', () => {
        console.log('ICE connection state changed to:', peerConnection.iceConnectionState);
        
        // Handle disconnected, failed, or closed states
        if (peerConnection.iceConnectionState === 'disconnected') {
          console.log('ICE connection disconnected - waiting to see if it recovers');
          
          // Set a timer to check if we recover naturally
          setTimeout(() => {
            if (peerConnectionRef.current && 
                peerConnectionRef.current.iceConnectionState === 'disconnected') {
              console.log('Still disconnected after timeout, attempting ICE restart');
              
              try {
                // Try to restart ICE gathering
                if (peerConnectionRef.current.signalingState === 'stable') {
                  console.log('Restarting ICE in stable state');
                  peerConnectionRef.current.restartIce();
                  
                  // Create a new offer with ICE restart if we're in a position to do so
                  if (!isSignalingInProgressRef.current && 
                      socketRef.current && 
                      partnerIdRef.current && 
                      Date.now() - lastOfferTimeRef.current > 3000) {
                    
                    isSignalingInProgressRef.current = true;
                    console.log('Creating new offer with ICE restart');
                    
                    peerConnectionRef.current.createOffer({ iceRestart: true })
                      .then(offer => {
                        if (peerConnectionRef.current) {
                          return peerConnectionRef.current.setLocalDescription(offer);
                        }
                      })
                      .then(() => {
                        if (socketRef.current && peerConnectionRef.current && partnerIdRef.current) {
                          lastOfferTimeRef.current = Date.now();
                          socketRef.current.emit('webrtc_offer', {
                            from: socketRef.current.id,
                            to: partnerIdRef.current,
                            offer: peerConnectionRef.current.localDescription
                          });
                        }
                        isSignalingInProgressRef.current = false;
                      })
                      .catch(err => {
                        console.error('Error creating ICE restart offer:', err);
                        isSignalingInProgressRef.current = false;
                      });
                  }
                }
              } catch (err) {
                console.error('Error restarting ICE:', err);
              }
            }
          }, 5000); // Give 5 seconds for natural recovery
          
        } else if (peerConnection.iceConnectionState === 'failed') {
          console.log('ICE connection failed - attempting recovery');
          
          recoveryAttemptsRef.current += 1;
          
          // If we've tried too many times, clean up and start fresh
          if (recoveryAttemptsRef.current > 2) {
            console.log('Too many recovery attempts, cleaning up connection');
            cleanupPeerConnection();
            
            // Try to reconnect after a brief delay
            setTimeout(() => {
              if (partnerIdRef.current && socketRef.current && socketRef.current.connected) {
                console.log('Re-establishing connection after cleanup');
                recoveryAttemptsRef.current = 0;
                connectToPartner(partnerIdRef.current, true);
              }
            }, 1000);
          } else {
            try {
              // Try to restart ICE gathering
              console.log('Attempting ICE restart on failed connection');
              peerConnection.restartIce();
              
              // Create a new offer with ICE restart
              if (peerConnection.signalingState === 'stable' &&
                  socketRef.current && 
                  partnerIdRef.current) {
                  
                isSignalingInProgressRef.current = true;
                
                peerConnection.createOffer({ iceRestart: true })
                  .then(offer => {
                    if (peerConnectionRef.current) {
                      return peerConnectionRef.current.setLocalDescription(offer);
                    }
                  })
                  .then(() => {
                    if (socketRef.current && peerConnectionRef.current && partnerIdRef.current) {
                      lastOfferTimeRef.current = Date.now();
                      socketRef.current.emit('webrtc_offer', {
                        from: socketRef.current.id,
                        to: partnerIdRef.current,
                        offer: peerConnectionRef.current.localDescription
                      });
                    }
                    isSignalingInProgressRef.current = false;
                  })
                  .catch(err => {
                    console.error('Error creating ICE restart offer:', err);
                    isSignalingInProgressRef.current = false;
                  });
              }
            } catch (err) {
              console.error('Error handling failed ICE connection:', err);
            }
          }
        } else if (peerConnection.iceConnectionState === 'connected' || 
                   peerConnection.iceConnectionState === 'completed') {
          console.log('ICE connection established successfully');
          recoveryAttemptsRef.current = 0;
        }
      });
      
      peerConnection.addEventListener('track', (event) => {
        console.log(`Remote track added: ${event.track.kind}`, event.streams);
        
        if (event.streams && event.streams[0]) {
          console.log('Setting remote stream from track event');
          
          // Display the remote video
          if (strangerVideoRef.current) {
            strangerVideoRef.current.srcObject = event.streams[0];
            
            strangerVideoRef.current.onloadedmetadata = () => {
              console.log('Remote video metadata loaded, playing...');
              
              strangerVideoRef.current!.play()
                .then(() => {
                  console.log('Remote video playing successfully');
                })
                .catch(err => {
                  console.error('Error playing remote video:', err);
                  
                  // If autoplay is blocked, try with muted
                  if (err.name === 'NotAllowedError') {
                    console.log('Autoplay blocked, trying with muted');
                    strangerVideoRef.current!.muted = true;
                    
                    strangerVideoRef.current!.play()
                      .then(() => {
                        console.log('Remote video playing with muted workaround');
                        // Unmute after starting playback if this is partner video
                        setTimeout(() => {
                          if (strangerVideoRef.current) {
                            strangerVideoRef.current.muted = false;
                            console.log('Unmuted partner video after autoplay fix');
                          }
                        }, 1000);
                      })
                      .catch(playErr => {
                        console.error('Failed to play remote video even with muted:', playErr);
                      });
                  }
                });
            };
          } else {
            console.warn('Partner video element not available');
          }
        } else {
          console.warn('No streams array in track event');
        }
      });
      
      // Add all local tracks to the peer connection
      try {
        if (userStreamRef.current) {
          userStreamRef.current.getTracks().forEach(track => {
            try {
              if (track.readyState === 'live') {
                console.log(`Adding ${track.kind} track to peer connection: ${track.label}`);
                peerConnection.addTrack(track, userStreamRef.current!);
              } else {
                console.warn(`Track ${track.kind} not in live state, attempting to fix`);
                
                // Try to get a new track if not in live state
                if (track.kind === 'video') {
                  navigator.mediaDevices.getUserMedia({ video: true })
                    .then(tempStream => {
                      const newTrack = tempStream.getVideoTracks()[0];
                      if (newTrack) {
                        console.log('Adding replacement video track');
                        peerConnection.addTrack(newTrack, userStreamRef.current!);
                        
                        // Stop the temporary stream's other tracks
                        tempStream.getTracks().forEach(t => {
                          if (t !== newTrack) t.stop();
                        });
                      }
                    })
                    .catch(err => console.error('Failed to get replacement video track:', err));
                }
                
                if (track.kind === 'audio') {
                  navigator.mediaDevices.getUserMedia({ audio: true })
                    .then(tempStream => {
                      const newTrack = tempStream.getAudioTracks()[0];
                      if (newTrack) {
                        console.log('Adding replacement audio track');
                        peerConnection.addTrack(newTrack, userStreamRef.current!);
                        
                        // Stop the temporary stream's other tracks
                        tempStream.getTracks().forEach(t => {
                          if (t !== newTrack) t.stop();
                        });
                      }
                    })
                    .catch(err => console.error('Failed to get replacement audio track:', err));
                }
              }
            } catch (err) {
              console.error(`Error adding ${track.kind} track to peer connection:`, err);
            }
          });
        }
      } catch (err) {
        console.error('Error adding tracks to peer connection:', err);
      }
      
      // Set connection reference for later use
      peerConnectionRef.current = peerConnection;
      return peerConnection;
    } catch (err) {
      console.error('Error creating peer connection:', err);
      setErrorMessage('Failed to create connection. Please refresh and try again.');
      return null;
    }
  }, [requestCameraAccess, setErrorMessage, cleanupPeerConnection]);

  // Connect to a partner with enhanced signaling and error handling
  const connectToPartner = useCallback(async (partnerIdToConnect: string, isInitiator: boolean) => {
    console.log(`Connecting to partner ${partnerIdToConnect} as ${isInitiator ? 'initiator' : 'receiver'}`);
    
    // Save partner ID for reference
    partnerIdRef.current = partnerIdToConnect;
    setPartnerId(partnerIdToConnect);
    
    // Make sure we have a valid socket connection
    if (!socketRef.current || !socketRef.current.connected) {
      console.error('Socket not connected, cannot establish WebRTC connection');
      setErrorMessage('Connection to server lost. Please refresh the page.');
      return;
    }
    
    // Check if we already have an active WebRTC connection with remote tracks
    if (peerConnectionRef.current) {
      // Check if we have remote tracks already
      const receivers = peerConnectionRef.current.getReceivers();
      const hasActiveRemoteTracks = receivers.some(receiver => 
        receiver.track && receiver.track.readyState === 'live');
      
      if (hasActiveRemoteTracks) {
        console.log('Already have active connection with remote tracks, not recreating');
        setIsConnectedToPartner(true);
        return;
      }
      
      // Clean up existing connection if it doesn't have active remote tracks
      console.log('Cleaning up existing connection before creating new one');
      cleanupPeerConnection();
    }
    
    // Make sure we have camera access
    if (!isCameraAllowed || !userStreamRef.current) {
      console.log('Camera not allowed or no local stream, requesting access...');
      
      try {
        await requestCameraAccess();
        console.log('Camera access granted');
      } catch (err) {
        console.error('Failed to get camera access:', err);
        setErrorMessage('Camera access required to chat. Please allow camera and refresh.');
        return;
      }
    }
    
    // Create the peer connection
    const peerConnection = createPeerConnection(isInitiator);
    
    if (!peerConnection) {
      console.error('Failed to create peer connection');
      return;
    }
    
    // Add ICE candidate handler
    peerConnection.onicecandidate = (event) => {
      if (event.candidate && socketRef.current && socketRef.current.connected) {
        console.log('New ICE candidate:', event.candidate.candidate.substring(0, 50) + '...');
        
        socketRef.current.emit('webrtc_ice_candidate', {
          from: socketRef.current.id,
          to: partnerIdToConnect,
          candidate: event.candidate
        });
      }
    };
    
    // Create and send offer if we're the initiator
    if (isInitiator) {
      console.log('Creating offer as initiator');
      
      try {
        const offer = await peerConnection.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true
        });
        
        console.log('Setting local description (offer)');
        await peerConnection.setLocalDescription(offer);
        
        // Wait a short time to allow ICE gathering to start
        await new Promise(resolve => setTimeout(resolve, 500));
        
        console.log('Sending offer to partner');
        if (socketRef.current && socketRef.current.connected) {
          socketRef.current.emit('webrtc_offer', {
            from: socketRef.current.id,
            to: partnerIdToConnect,
            offer: peerConnection.localDescription
          });
          
          // Update connection state
          setIsConnectedToPartner(true);
        } else {
          throw new Error('Socket disconnected while creating offer');
        }
      } catch (err) {
        console.error('Error creating/sending offer:', err);
        setErrorMessage('Failed to establish connection. Please try refreshing.');
        
        // Clean up on error
        cleanupPeerConnection();
      }
    }
    
    // Set up a connection timeout
    const connectionTimeoutId = setTimeout(() => {
      if (peerConnectionRef.current && 
          peerConnectionRef.current.iceConnectionState !== 'connected' && 
          peerConnectionRef.current.iceConnectionState !== 'completed') {
        
        console.warn('WebRTC connection timed out after 15 seconds');
        setErrorMessage('Connection timed out. Try refreshing or finding a new partner.');
        
        // Clean up on timeout
        cleanupPeerConnection();
      }
    }, 15000);
    
    // Store the timeout ID for cleanup
    connectionTimeoutRef.current = connectionTimeoutId;
  }, [
    cleanupPeerConnection,
    createPeerConnection,
    isCameraAllowed,
    requestCameraAccess,
    setErrorMessage,
    setIsConnectedToPartner,
    setPartnerId
  ]);

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

  // Handle starting a new chat with a different partner
  const handleStartNewChat = () => {
    console.log("Starting new chat");
    
    // Set status first for immediate user feedback
    setConnectionStatus("Searching for partner...");
    
    // Cancel any active timeouts
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }
    
    // Notify partner that we're starting a new chat (if we have a connected partner)
    if (socketRef.current && partnerIdRef.current && isRealPartner) {
      console.log("Notifying partner about new chat");
      socketRef.current.emit("start_new_chat", {
        partnerId: partnerIdRef.current
      });
    }
    
    // Reset state EXCEPT for camera state
    setIsSearchingForPartner(true);
    setIsRealPartner(false);
    setMessages([]);
    setIsActiveConnection(false);
    setIsConnecting(true);
    
    // Don't reset current video, just transition to searching indicator
    // setCurrentVideoId(null);
    
    // Clean up existing WebRTC connection but PRESERVE local video
    if (peerConnectionRef.current) {
      // Don't stop local media tracks, only close the peer connection
      try {
        peerConnectionRef.current.ontrack = null;
        peerConnectionRef.current.onicecandidate = null;
        peerConnectionRef.current.onconnectionstatechange = null;
        peerConnectionRef.current.oniceconnectionstatechange = null;
        
        // Close the connection but DON'T stop local tracks
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
        
        // Clear the stranger video ONLY
        if (strangerVideoRef.current) {
          strangerVideoRef.current.srcObject = null;
        }
        
        console.log('WebRTC peer connection cleaned up (preserved local tracks)');
      } catch (err) {
        console.error('Error while cleaning up peer connection:', err);
      }
    }
    
    // Connect to new partner
    if (socketRef.current) {
      // Find a new partner
      findPartner(socketRef.current);
    }
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
          <SolmegleWatermark>Solmegle</SolmegleWatermark>
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
      
      // Create the socket with more resilient settings
      const newSocket = io(window.location.origin, {
        transports: ['websocket', 'polling'],
        upgrade: true,
        reconnection: true,
        reconnectionAttempts: 15,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 30000,
        forceNew: true
      });
      
      socketRef.current = newSocket;

      // Connection established
      newSocket.on("connect", () => {
        console.log("Socket connected with ID:", newSocket.id);
        setConnectionStatus("Socket connected. Ready to find partners.");
        
        // Set userId to socket.id for reliable reference
        if (newSocket.id) {
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
      
      // Handle disconnection
      newSocket.on("disconnect", (reason) => {
        console.log(`Socket disconnected: ${reason}`);
        setConnectionStatus(`Connection lost: ${reason}. Reconnecting...`);
      });
      
      // Handle reconnection
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
      
      // Connection status events
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

      // Handle matched event - this is when we are paired with another user
      newSocket.on("matched", (matchedPartnerId: string) => {
        console.log(`MATCHED EVENT RECEIVED: Matched with partner ${matchedPartnerId}`);
        
        // CRITICAL FIX: Check if we're already matched with this partner
        if (partnerId === matchedPartnerId && isRealPartner && isActiveConnection) {
          console.log(`Already matched with ${matchedPartnerId}, not recreating connection`);
          setConnectionStatus("Already connected with partner");
          return;
        }
        
        // CRITICAL FIX: Prevent multiple state updates causing camera glitching
        if (isConnecting && isActiveConnection) {
          console.log("Already in connecting state, not starting another connection");
          return;
        }
        
        // Update state to show matched
        setConnectionStatus(`Matched with a partner! Setting up connection...`);
        setPartnerId(matchedPartnerId);
        partnerIdRef.current = matchedPartnerId; // CRITICAL FIX: Update ref for consistent access
        setIsRealPartner(true);
        setIsActiveConnection(true);
        setIsConnecting(true);
        setIsSearchingForPartner(false); // Stop searching once matched
        
        // Clear all messages for a new chat session
        setMessages([]);

        // Since we found a real partner, clear any timeout for video fallback
        if (partnerConnectionTimeout.current) {
          clearTimeout(partnerConnectionTimeout.current);
          partnerConnectionTimeout.current = null;
        }

        // If we have camera access, proceed with connection
        if (userStreamRef.current) {
          console.log("Already have local stream, setting up connection");
          connectToPartner(matchedPartnerId, true);
        } else {
          // Request camera access first
          console.log("No local stream available, requesting camera access first");
          requestCameraAccess()
            .then(() => {
              console.log("Camera access granted, can now create WebRTC connection");
              connectToPartner(matchedPartnerId, true);
            })
            .catch(err => {
              console.error("Failed to get camera access after match:", err);
              setConnectionStatus("Camera access denied. Please enable camera and try again.");
              setIsConnecting(false);
            });
        }
      });

      // Partner disconnection handling
      newSocket.on("partner_disconnected", () => {
        console.log("Partner disconnected");
        setConnectionStatus("Your partner disconnected. Click 'New Chat' to find a new partner.");
        handlePartnerDisconnect();
      });

      // Waiting count update
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

      // WebRTC signaling events
      newSocket.on("webrtc_offer", async (data: any) => {
        console.log("Received WebRTC offer:", data);
        
        if (!data || !data.from || !data.offer) {
          console.error("Invalid offer data received:", data);
          return;
        }
        
        try {
          // Save the partner ID from the offer
          setPartnerId(data.from);
          partnerIdRef.current = data.from;
          
          if (!peerConnectionRef.current) {
            console.log("Creating new peer connection for offer");
            // Create a new peer connection as non-initiator
            connectToPartner(data.from, false);
            
            // Wait for the peer connection to be created
            let attempts = 0;
            const checkPeerConnection = setInterval(() => {
              if (peerConnectionRef.current) {
                clearInterval(checkPeerConnection);
                handleWebRTCOffer(data);
              } else if (attempts >= 10) {
                clearInterval(checkPeerConnection);
                console.error("Failed to create peer connection for answer");
              }
              attempts++;
            }, 200);
          } else {
            handleWebRTCOffer(data);
          }
        } catch (err) {
          console.error("Error handling WebRTC offer:", err);
          setConnectionStatus(`Connection error. Try 'New Chat'.`);
        }
      });
      
      // Handle WebRTC offer
      const handleWebRTCOffer = async (data: any) => {
        if (!peerConnectionRef.current) {
          console.error("No peer connection available to handle offer");
          return;
        }
        
        // If signaling is already in progress, log and prioritize
        if (isSignalingInProgressRef.current) {
          console.log("Signaling already in progress, handling with priority");
        }
        
        isSignalingInProgressRef.current = true;
        
        try {
          // Check the connection state to avoid errors
          const currentState = peerConnectionRef.current.signalingState;
          
          // Handle different signaling states appropriately
          if (currentState === 'have-local-offer') {
            // If we already have a local offer, see who should win based on ID comparison
            const localSocketId = socketRef.current ? socketRef.current.id : '';
            const remoteSocketId = data.from;
            
            if (localSocketId && remoteSocketId) {
              if (localSocketId > remoteSocketId) {
                // Our ID is higher, so our offer should win - reject their offer
                console.log("Collision detected, our offer takes precedence based on ID comparison");
                isSignalingInProgressRef.current = false;
                return;
              } else {
                // Their ID is higher, so their offer should win - rollback ours
                console.log("Collision detected, their offer takes precedence, rolling back our offer");
                try {
                  await peerConnectionRef.current.setLocalDescription({type: 'rollback'} as RTCSessionDescription);
                } catch (err) {
                  console.error("Error rolling back local description:", err);
                }
              }
            }
          } else if (currentState === 'have-remote-offer') {
            console.log("Already have a remote offer, attempting rollback");
            try {
              await peerConnectionRef.current.setLocalDescription({type: 'rollback'} as RTCSessionDescription);
            } catch (err) {
              console.error("Error with rollback:", err);
              // If rollback fails, restart with new connection
              cleanupPeerConnection();
              connectToPartner(data.from, false);
              isSignalingInProgressRef.current = false;
              return;
            }
          } else if (currentState !== 'stable') {
            console.log(`Connection in ${currentState} state, not ideal for setting offer`);
            
            // For other non-stable states, try to get back to stable
            if (peerConnectionRef.current.signalingState === 'closed') {
              console.log("Connection is closed, creating new peer connection");
              cleanupPeerConnection();
              connectToPartner(data.from, false);
              isSignalingInProgressRef.current = false;
              return;
            }
          }
          
          // Set the remote description from the offer
          console.log("Setting remote description from offer");
          await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.offer));
          console.log("Set remote description from offer successfully");
          remoteDescriptionSetRef.current = true;
          
          // Process any pending ICE candidates now
          if (pendingIceCandidatesRef.current.length > 0) {
            console.log(`Processing ${pendingIceCandidatesRef.current.length} pending ICE candidates after offer`);
            
            // Process candidates sequentially with await to ensure order
            for (const candidate of pendingIceCandidatesRef.current) {
              try {
                await peerConnectionRef.current.addIceCandidate(candidate);
                console.log("Successfully added pending ICE candidate after offer");
              } catch (err) {
                console.error("Error adding pending ICE candidate after offer:", err);
              }
            }
            
            // Clear the pending candidates
            pendingIceCandidatesRef.current = [];
          }
          
          // Create an answer
          console.log("Creating answer");
          const answer = await peerConnectionRef.current.createAnswer();
          console.log("Setting local description (answer)");
          await peerConnectionRef.current.setLocalDescription(answer);
          console.log("Created and set local answer");
          
          // Send the answer back
          if (socketRef.current && socketRef.current.connected) {
            console.log("Sending answer to", data.from);
            socketRef.current.emit("webrtc_answer", {
              from: socketRef.current.id,
              to: data.from,
              answer: answer
            });
          } else {
            console.error("Socket not connected, cannot send answer");
          }
        } catch (err) {
          console.error("Error handling WebRTC offer:", err);
          setConnectionStatus(`Connection error. Try 'New Chat'.`);
        } finally {
          isSignalingInProgressRef.current = false;
        }
      };

      // Handle WebRTC answer
      newSocket.on("webrtc_answer", async (data: any) => {
        console.log("Received WebRTC answer:", data);
        
        if (!data || !data.from || !data.answer) {
          console.error("Invalid answer data received:", data);
          return;
        }
        
        try {
          if (!peerConnectionRef.current) {
            console.error("No peer connection available for setting remote description");
            return;
          }
          
          // Check signaling state before setting remote description
          const currentState = peerConnectionRef.current.signalingState;
          
          if (currentState !== 'have-local-offer') {
            console.warn(`Peer connection in ${currentState} state, not have-local-offer as expected for answer`);
            
            // If we're in stable state, we might have received the answer too late
            if (currentState === 'stable') {
              console.log("Already in stable state, answer may be redundant or arrived late");
              return; // Ignore the answer if we're already in stable state
            }
            
            // If we're in an unexpected state, try to recover
            if (currentState === 'have-remote-offer') {
              console.log("Have remote offer when expecting to set answer - state mismatch");
              // We might need to create an answer instead, but let's not trigger here
              return;
            }
            
            // For closed state, we need to recreate the connection
            if (currentState === 'closed') {
              console.log("Connection closed, cannot set remote description");
              // Reconnect if the connection was closed
              if (partnerIdRef.current) {
                cleanupPeerConnection();
                setTimeout(() => {
                  connectToPartner(partnerIdRef.current!, true);
                }, 1000);
              }
              return;
            }
          }
          
          // Set the remote description from the answer
          console.log("Setting remote description from answer");
          await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
          console.log("Successfully set remote description from answer");
          remoteDescriptionSetRef.current = true;
          setConnectionStatus("Connected to partner");
          
          // Process any pending ICE candidates now that remote description is set
          if (pendingIceCandidatesRef.current.length > 0) {
            console.log(`Processing ${pendingIceCandidatesRef.current.length} pending ICE candidates after answer`);
            
            for (const candidate of pendingIceCandidatesRef.current) {
              try {
                await peerConnectionRef.current.addIceCandidate(candidate);
                console.log("Successfully added pending ICE candidate after answer");
              } catch (err) {
                console.error("Error adding pending ICE candidate after answer:", err);
              }
            }
            
            // Clear the pending candidates
            pendingIceCandidatesRef.current = [];
          }
        } catch (err: any) {
          console.error("Error handling WebRTC answer:", err);
          
          // Instead of just showing error, attempt recovery
          if (err.name === 'InvalidStateError' && peerConnectionRef.current) {
            console.log("InvalidStateError when setting remote answer, attempting recovery");
            
            // If we already have a stable connection, it might be from a race condition
            // where we received and processed the answer through a different path
            if (peerConnectionRef.current.signalingState === 'stable') {
              console.log("Connection already in stable state despite error - likely a race condition");
              return;
            }
            
            // For other state errors, try a delayed recovery
            setTimeout(() => {
              if (peerConnectionRef.current && partnerIdRef.current &&
                  peerConnectionRef.current.signalingState !== 'closed') {
                  
                console.log("Attempting recovery after error with new offer");
                
                // Try to create a new offer to re-establish signaling
                isSignalingInProgressRef.current = true;
                
                peerConnectionRef.current.createOffer({ iceRestart: true })
                  .then(offer => {
                    if (peerConnectionRef.current) {
                      return peerConnectionRef.current.setLocalDescription(offer);
                    }
                  })
                  .then(() => {
                    if (socketRef.current && peerConnectionRef.current && partnerIdRef.current) {
                      lastOfferTimeRef.current = Date.now();
                      socketRef.current.emit('webrtc_offer', {
                        from: socketRef.current.id,
                        to: partnerIdRef.current,
                        offer: peerConnectionRef.current.localDescription
                      });
                    }
                    isSignalingInProgressRef.current = false;
                  })
                  .catch(err => {
                    console.error('Error creating recovery offer:', err);
                    isSignalingInProgressRef.current = false;
                  });
              }
            }, 2000);
          }
          
          setConnectionStatus(`Connection issue. Try 'New Chat' if video doesn't appear.`);
        }
      });

      // Handle ICE candidates
      newSocket.on("webrtc_ice_candidate", async (data: any) => {
        console.log("Received ICE candidate");
        
        if (!data || !data.from || !data.candidate) {
          console.error("Invalid ICE candidate data received:", data);
          return;
        }
        
        // Create the ICE candidate object
        const candidate = new RTCIceCandidate(data.candidate);
        
        if (peerConnectionRef.current) {
          try {
            // Check if remote description is set
            if (peerConnectionRef.current.remoteDescription && 
                peerConnectionRef.current.remoteDescription !== null) {
              
              // Remote description is set, add candidate directly
              await peerConnectionRef.current.addIceCandidate(candidate);
              console.log("Added ICE candidate successfully");
              remoteDescriptionSetRef.current = true;
              
              // If we have pending candidates, add them now
              if (pendingIceCandidatesRef.current.length > 0) {
                console.log(`Adding ${pendingIceCandidatesRef.current.length} pending ICE candidates`);
                
                // Process all pending candidates
                for (const pendingCandidate of pendingIceCandidatesRef.current) {
                  try {
                    await peerConnectionRef.current.addIceCandidate(pendingCandidate);
                    console.log("Added pending ICE candidate successfully");
                  } catch (err) {
                    console.error("Error adding pending ICE candidate:", err);
                  }
                }
                
                // Clear the pending candidates
                pendingIceCandidatesRef.current = [];
              }
            } else {
              // Remote description not set yet, store candidate for later
              console.log("Remote description not set yet, storing ICE candidate for later");
              pendingIceCandidatesRef.current.push(candidate);
            }
          } catch (error) {
            console.error("Error adding ICE candidate:", error);
          }
        } else {
          console.warn("Cannot add ICE candidate: No peer connection available");
          pendingIceCandidatesRef.current.push(candidate);
        }
      });

      // Handle chat messages
      newSocket.on("user_message", (message: string) => {
        console.log("Received message:", message);
        setMessages(prev => [...prev, { text: message, isUser: false }]);
      });

      // Add new event for partner starting a new chat
      newSocket.on("partner_start_new", () => {
        console.log("Partner clicked New Chat, showing static video");
        
        // Show static video
        setIsSearchingForPartner(true);
        setIsRealPartner(false);
        
        // Clean up PeerConnection but don't stop local video
        if (peerConnectionRef.current) {
          try {
            peerConnectionRef.current.ontrack = null;
            peerConnectionRef.current.onicecandidate = null;
            peerConnectionRef.current.onconnectionstatechange = null;
            peerConnectionRef.current.oniceconnectionstatechange = null;
            
            // Close the connection but DON'T stop local tracks
            peerConnectionRef.current.close();
            peerConnectionRef.current = null;
            
            // Clear the stranger video
            if (strangerVideoRef.current) {
              strangerVideoRef.current.srcObject = null;
            }
            
            console.log('WebRTC peer connection closed due to partner starting new chat');
          } catch (err) {
            console.error('Error while cleaning up peer connection:', err);
          }
        }
        
        setConnectionStatus("Your partner started a new chat.");
      });
    }
  }, [cleanupPeerConnection, connectToPartner, findPartner, handlePartnerDisconnect, isActiveConnection, isConnecting, isRealPartner, isSearchingForPartner, partnerId, requestCameraAccess, setUserId]);

  // Start WebRTC connection when we get a match
  useEffect(() => {
    if (partnerId && isRealPartner && socketRef.current && userStreamRef.current) {
      console.log("Starting WebRTC with matched partner", partnerId);
      connectToPartner(partnerId, true);
    }
  }, [partnerId, isRealPartner, connectToPartner]);

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
              // Only connect if we have a valid partner ID
              if (partnerId) {
                connectToPartner(partnerId, true);
              } else {
                // Start searching for a partner
                if (socketRef.current) {
                  findPartner(socketRef.current);
                }
              }
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
  }, [requestCameraAccess, connectToPartner, findPartner]);

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
      // Only connect if we have a valid partner ID or start searching
      if (partnerId) {
        connectToPartner(partnerId, true);
      } else {
        // Start searching for a partner
        if (socketRef.current) {
          findPartner(socketRef.current);
        }
      }
    }
  }, [isCameraAllowed, currentVideoId, isSearchingForPartner, connectToPartner, findPartner]);

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

  // Handle matched event for new partner
  const handleMatchedEvent = useCallback((data: any) => {
    console.log("MATCHED event received with data:", data);
    
    // Extract the matched partner's ID
    const matchedPartnerId = data.partnerId;
    
    if (!matchedPartnerId) {
      console.error("Received matched event without valid partnerId");
      return;
    }
    
    // Set that we have a real partner now
    setIsRealPartner(true);
    setIsSearchingForPartner(false);
    setConnectionStatus("Connected to a partner!");
    
    // Set the partner ID and clear any existing messages
    setPartnerId(matchedPartnerId);
    setMessages([]);
    
    // Now create the new connection with small delay to allow state to settle
    setTimeout(() => {
      connectToPartner(matchedPartnerId, true);
    }, 500);
  }, [connectToPartner, setIsRealPartner, setIsSearchingForPartner, setPartnerId]);

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
              <ControlButton primary onClick={handleStartNewChat}>New Chat</ControlButton>
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
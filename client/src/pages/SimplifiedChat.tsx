import React, { useState, useEffect, useRef, useCallback } from 'react';
import styled from 'styled-components';
import Header from '../components/Header';

// Total videos count constant
const TOTAL_VIDEOS = 43;

const SolmegleChat: React.FC = () => {
  const [hasCameraAccess, setHasCameraAccess] = useState(false);
  const [isSearchingForPartner, setIsSearchingForPartner] = useState(false);
  const [messageInput, setMessageInput] = useState('');
  const [messages, setMessages] = useState<{text: string; isUser: boolean}[]>([]);
  
  // Add states for fallback videos
  const [currentVideoId, setCurrentVideoId] = useState<number | null>(null);
  const [isRealPartner, setIsRealPartner] = useState(false);
  
  const userVideoRef = useRef<HTMLVideoElement>(null);
  const strangerVideoRef = useRef<HTMLVideoElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Function to get random video ID
  const getRandomVideoId = useCallback(() => {
    // Avoid showing the same video twice in a row
    let newId;
    do {
      newId = Math.floor(Math.random() * TOTAL_VIDEOS) + 1;
    } while (newId === currentVideoId);
    return newId;
  }, [currentVideoId]);

  // Update connectToPartner to prioritize real user connections
  const connectToPartner = useCallback(() => {
    // Clear all messages for the new session
    setMessages([]);
    
    // Show static video while searching
    setIsSearchingForPartner(true);
    setCurrentVideoId(null);
    
    // Function to check for real users
    const checkForRealUsers = () => {
      // This would be a real API check in production
      // For now, we simulate the check
      const hasRealPartners = false; // Replace with actual API call
      
      if (hasRealPartners) {
        // Real user connection logic would go here
        setIsRealPartner(true);
        setIsSearchingForPartner(false);
        // More implementation for real connection
      } else {
        // If no real users found after 5 seconds, use fallback video
        const videoId = getRandomVideoId();
        console.log(`No real partners found. Loading video: ${videoId}.mp4`);
        setCurrentVideoId(videoId);
        setIsRealPartner(false);
        setIsSearchingForPartner(false);
      }
    };

    // Try to find real users multiple times before falling back to video
    let attempts = 0;
    const maxAttempts = 3;
    const attemptInterval = 1500; // 1.5 seconds between attempts

    const findUser = () => {
      if (attempts < maxAttempts) {
        console.log(`Searching for real users... Attempt ${attempts + 1}/${maxAttempts}`);
        // This would be your actual user matching logic
        const hasMatch = false; // Replace with real matching logic
        
        if (hasMatch) {
          // Found a real user
          setIsRealPartner(true);
          setIsSearchingForPartner(false);
          // Implement real connection logic here
        } else {
          attempts++;
          setTimeout(findUser, attemptInterval);
        }
      } else {
        // After all attempts, fall back to video
        const videoId = getRandomVideoId();
        console.log(`No real partners found after ${maxAttempts} attempts. Loading video: ${videoId}.mp4`);
        setCurrentVideoId(videoId);
        setIsRealPartner(false);
        setIsSearchingForPartner(false);
      }
    };

    // Start searching for real users
    findUser();
  }, [getRandomVideoId, setMessages]);

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

  // Request camera access as soon as the component mounts
  useEffect(() => {
    // Check if we already have camera access
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then(stream => {
        console.log("Camera permission granted");
        if (userVideoRef.current) {
          userVideoRef.current.srcObject = stream;
        }
        setHasCameraAccess(true);
      })
      .catch(error => {
        console.error('Camera access error:', error);
        setHasCameraAccess(false);
      });
  }, []);

  const requestCameraAccess = useCallback(() => {
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then(stream => {
        if (userVideoRef.current) {
          userVideoRef.current.srcObject = stream;
        }
        setHasCameraAccess(true);
      })
      .catch(error => {
        console.error('Error accessing camera:', error);
        setHasCameraAccess(false);
      });
  }, [userVideoRef]);

  // Modified startNewChat function
  const startNewChat = useCallback(() => {
    if (!hasCameraAccess) {
      requestCameraAccess();
      return;
    }
    // Clear all messages when starting a new chat
    setMessages([]);
    
    // Connect to a new partner (or fallback video)
    connectToPartner();
  }, [hasCameraAccess, requestCameraAccess, setMessages, connectToPartner]);

  // Initiate a connection when the component mounts and camera access is granted
  useEffect(() => {
    if (hasCameraAccess && currentVideoId === null && !isSearchingForPartner) {
      connectToPartner();
    }
  }, [hasCameraAccess, currentVideoId, isSearchingForPartner, connectToPartner]);

  // Add useEffect to scroll to bottom of messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Update the sendMessage function to remove automatic stranger response
  const sendMessage = () => {
    if (messageInput.trim() === '') return;
    
    // Add only user message
    setMessages([...messages, { text: messageInput, isUser: true }]);
    setMessageInput('');
  };

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
              {hasCameraAccess ? (
                <video ref={userVideoRef} autoPlay muted playsInline />
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
              <div ref={messagesEndRef} />
            </ChatMessages>
            <ChatInputArea>
              <MessageInput 
                placeholder="Type a message..." 
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
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
  
  video {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
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
`;

const StrangerVideo = styled.video`
  width: 100%;
  height: 100%;
  object-fit: contain;
  background-color: #000;
  max-height: 100%;
  max-width: 100%;
  pointer-events: none; /* Prevent user interaction with the video */
  display: block; /* Fix potential layout issues */
  position: absolute; /* Ensure it fills the container */
  top: 0;
  left: 0;
  z-index: 1; /* Make sure it's above any background */
  
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

export default SolmegleChat;
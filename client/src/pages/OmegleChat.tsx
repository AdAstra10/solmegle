import React, { useState, useEffect, useRef } from 'react';
import styled from 'styled-components';
import Header from '../components/Header';
import { useAuth } from '../context/AuthContext';
import WalletConnectModal from '../components/WalletConnectModal';

const OmegleChat: React.FC = () => {
  const { user } = useAuth();
  const [isCameraEnabled, setIsCameraEnabled] = useState(false);
  const [isTextMode, setIsTextMode] = useState(false);
  const [isSearchingForPartner, setIsSearchingForPartner] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  const localVideoRef = useRef<HTMLVideoElement>(null);

  // Request camera access as soon as the component mounts
  useEffect(() => {
    // Automatically request camera permission when component mounts
    requestCameraAccess();
  }, []);

  // Handle enabling camera
  const requestCameraAccess = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        setIsCameraEnabled(true);
      }
    } catch (error) {
      console.error('Error accessing camera:', error);
      alert('Camera access denied. Please allow camera access to use this application.');
      setIsCameraEnabled(false);
    }
  };

  // Start a new chat
  const startNewChat = () => {
    if (!isCameraEnabled && !isTextMode) {
      return; // Can't start chat without camera or text mode
    }
    setIsSearchingForPartner(true);
    // In a real implementation, this would connect to a server to find a partner
    setTimeout(() => {
      setIsSearchingForPartner(false);
      // This would normally set up the connection with the found partner
    }, 2000);
  };

  // Switch to text mode
  const switchToText = () => {
    setIsTextMode(true);
    setIsCameraEnabled(false);
  };

  return (
    <>
      <Header />
      <ChatContainer>
        <VideoSection>
          <VideoContainer>
            <LocalVideo ref={localVideoRef} autoPlay muted playsInline />
          </VideoContainer>
          <RemoteVideoContainer>
            <EmptyVideoSpace>
              {isSearchingForPartner ? 'Searching for a partner...' : 'Stranger disconnected'}
            </EmptyVideoSpace>
          </RemoteVideoContainer>
        </VideoSection>
        
        <ControlSection>
          {!isCameraEnabled && !isTextMode ? (
            <ControlOptions>
              <NewChatButton onClick={requestCameraAccess}>New chat</NewChatButton>
              <OrText>or</OrText>
              <TextOptionLink onClick={switchToText}>switch to text</TextOptionLink>
              <OrText>or</OrText>
              <TextOptionLink href="#">unmoderated section</TextOptionLink>
            </ControlOptions>
          ) : (
            <NewChatButton onClick={startNewChat}>
              {isSearchingForPartner ? 'Searching...' : 'New chat'}
            </NewChatButton>
          )}
          
          <PreferencesSection>
            <PreferenceCheckbox type="checkbox" id="common-interests" />
            <PreferenceLabel htmlFor="common-interests">
              Find strangers with common interests <EnableLink href="#">(Enable)</EnableLink>
            </PreferenceLabel>
          </PreferencesSection>
        </ControlSection>
        
        {isTextMode && (
          <ChatInterface>
            <ChatMessages />
            <ChatInputArea>
              <MessageInput placeholder="Type a message..." />
              <SendButton>Send</SendButton>
            </ChatInputArea>
          </ChatInterface>
        )}
      </ChatContainer>
      <OmegleFooter>
        <OmegleLogo>omegle.com</OmegleLogo>
      </OmegleFooter>
    </>
  );
};

// Styled components
const ChatContainer = styled.main`
  max-width: 1200px;
  margin: 0 auto;
  padding: ${({ theme }) => theme.spacing.md};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

const VideoSection = styled.section`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: ${({ theme }) => theme.spacing.md};
  
  @media (max-width: ${({ theme }) => theme.breakpoints.md}) {
    grid-template-columns: 1fr;
  }
`;

const VideoContainer = styled.div`
  background-color: #333;
  border-radius: ${({ theme }) => theme.borderRadius.medium};
  overflow: hidden;
  aspect-ratio: 4/3;
  display: flex;
  justify-content: center;
  align-items: center;
`;

const RemoteVideoContainer = styled.div`
  background-color: #333;
  border-radius: ${({ theme }) => theme.borderRadius.medium};
  overflow: hidden;
  aspect-ratio: 4/3;
  display: flex;
  justify-content: center;
  align-items: center;
`;

const LocalVideo = styled.video`
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
`;

const EmptyVideoSpace = styled.div`
  color: white;
  text-align: center;
  padding: ${({ theme }) => theme.spacing.lg};
`;

const ControlSection = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing.md} 0;
`;

const ControlOptions = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const NewChatButton = styled.button`
  background-color: #09f;
  color: white;
  border: none;
  padding: ${({ theme }) => theme.spacing.md} ${({ theme }) => theme.spacing.xl};
  border-radius: ${({ theme }) => theme.borderRadius.medium};
  font-size: 1.25rem;
  font-weight: 500;
  cursor: pointer;
  transition: ${({ theme }) => theme.transition};
  
  &:hover {
    background-color: #007dd1;
  }
`;

const OrText = styled.span`
  color: ${({ theme }) => theme.colors.darkGray};
`;

const TextOptionLink = styled.a`
  color: blue;
  text-decoration: none;
  cursor: pointer;
  
  &:hover {
    text-decoration: underline;
  }
`;

const PreferencesSection = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  margin-top: ${({ theme }) => theme.spacing.sm};
`;

const PreferenceCheckbox = styled.input`
  margin: 0;
`;

const PreferenceLabel = styled.label`
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.text};
`;

const EnableLink = styled.a`
  color: blue;
  text-decoration: none;
  
  &:hover {
    text-decoration: underline;
  }
`;

const ChatInterface = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
  margin-top: ${({ theme }) => theme.spacing.md};
`;

const ChatMessages = styled.div`
  min-height: 200px;
  max-height: 400px;
  background-color: white;
  border: 1px solid ${({ theme }) => theme.colors.lightGray};
  border-radius: ${({ theme }) => theme.borderRadius.medium};
  padding: ${({ theme }) => theme.spacing.md};
  overflow-y: auto;
`;

const ChatInputArea = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const MessageInput = styled.textarea`
  flex: 1;
  min-height: 60px;
  padding: ${({ theme }) => theme.spacing.sm};
  border: 1px solid ${({ theme }) => theme.colors.lightGray};
  border-radius: ${({ theme }) => theme.borderRadius.small};
  resize: none;
  font-family: inherit;
`;

const SendButton = styled.button`
  background-color: ${({ theme }) => theme.colors.primary};
  color: white;
  border: none;
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  border-radius: ${({ theme }) => theme.borderRadius.small};
  cursor: pointer;
  align-self: flex-end;
`;

const OmegleFooter = styled.footer`
  display: flex;
  justify-content: flex-start;
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  background-color: #333;
`;

const OmegleLogo = styled.div`
  color: #f60;
  font-size: 1.25rem;
  font-weight: 700;
`;

export default OmegleChat; 
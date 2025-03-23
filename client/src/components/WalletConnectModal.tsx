import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import Button from './Button';
import { useWalletConnection } from '../context/WalletContext';
import { useAuth } from '../context/AuthContext';

interface WalletConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const WalletConnectModal: React.FC<WalletConnectModalProps> = ({ isOpen, onClose }) => {
  const [isConnecting, setIsConnecting] = useState(false);
  const { connect, connected, isPhantomInstalled } = useWalletConnection();
  const { connectWallet, continueAsGuest, loading, user } = useAuth();

  // Auto-close modal when user is connected
  useEffect(() => {
    if (user && isOpen) {
      onClose();
    }
  }, [user, isOpen, onClose]);

  const handleConnectWallet = async () => {
    try {
      setIsConnecting(true);
      const walletPublicKey = await connect();
      
      if (connected && walletPublicKey) {
        await connectWallet(walletPublicKey);
        onClose(); // Explicitly close modal when wallet is connected
      }
    } catch (error) {
      console.error('Error connecting wallet:', error);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleContinueAsGuest = async () => {
    try {
      await continueAsGuest();
      // Modal will auto-close via the useEffect
    } catch (error) {
      console.error('Error continuing as guest:', error);
    }
  };

  if (!isOpen) return null;

  return (
    <ModalOverlay>
      <ModalContainer>
        <ModalHeader>
          <ModalTitle>Connect to FlexRocket</ModalTitle>
          <CloseButton onClick={onClose}>&times;</CloseButton>
        </ModalHeader>
        <ModalContent>
          {!isPhantomInstalled ? (
            <>
              <WarningMessage>
                Phantom wallet is not installed. You can continue as a guest or install Phantom.
              </WarningMessage>
              <OptionButton
                variant="primary"
                isFullWidth
                onClick={handleContinueAsGuest}
                disabled={loading}
              >
                Continue as Guest
              </OptionButton>
              <Divider>
                <DividerText>OR</DividerText>
              </Divider>
              <OptionButton 
                variant="outline" 
                isFullWidth
                onClick={() => window.open("https://phantom.app/", "_blank")}
              >
                Install Phantom Wallet
              </OptionButton>
            </>
          ) : (
            <>
              <ModalDescription>
                Choose how you want to use the chat:
              </ModalDescription>
              <OptionContainer>
                <OptionCard onClick={handleContinueAsGuest} disabled={loading}>
                  <OptionIcon>👥</OptionIcon>
                  <OptionTitle>Guest Mode</OptionTitle>
                  <OptionDescription>No signup required, start chatting immediately</OptionDescription>
                </OptionCard>
                <OptionCard onClick={handleConnectWallet} disabled={isConnecting || loading}>
                  <OptionIcon>🔐</OptionIcon>
                  <OptionTitle>Connect Wallet</OptionTitle>
                  <OptionDescription>Use your Phantom wallet for enhanced features</OptionDescription>
                </OptionCard>
              </OptionContainer>
            </>
          )}
        </ModalContent>
      </ModalContainer>
    </ModalOverlay>
  );
};

const ModalOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
`;

const ModalContainer = styled.div`
  background-color: white;
  width: 100%;
  max-width: 400px;
  border-radius: ${({ theme }) => theme.borderRadius.medium};
  box-shadow: ${({ theme }) => theme.boxShadow};
  overflow: hidden;
`;

const ModalHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: ${({ theme }) => theme.spacing.md};
  border-bottom: 1px solid ${({ theme }) => theme.colors.lightGray};
`;

const ModalTitle = styled.h2`
  margin: 0;
  color: ${({ theme }) => theme.colors.text};
  font-size: 1.25rem;
  font-weight: 600;
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.darkGray};
  
  &:hover {
    color: ${({ theme }) => theme.colors.text};
  }
`;

const ModalContent = styled.div`
  padding: ${({ theme }) => theme.spacing.lg};
`;

const OptionButton = styled(Button)`
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const Divider = styled.div`
  display: flex;
  align-items: center;
  text-align: center;
  margin: ${({ theme }) => theme.spacing.md} 0;
  
  &::before, &::after {
    content: '';
    flex: 1;
    border-bottom: 1px solid ${({ theme }) => theme.colors.lightGray};
  }
`;

const DividerText = styled.span`
  padding: 0 ${({ theme }) => theme.spacing.sm};
  color: ${({ theme }) => theme.colors.darkGray};
  font-size: 0.875rem;
`;

const WarningMessage = styled.div`
  background-color: ${({ theme }) => `${theme.colors.warning}22`};
  color: ${({ theme }) => theme.colors.warning};
  padding: ${({ theme }) => theme.spacing.md};
  border-radius: ${({ theme }) => theme.borderRadius.small};
  margin-bottom: ${({ theme }) => theme.spacing.md};
  font-size: 0.875rem;
  text-align: center;
`;

const ModalDescription = styled.div`
  margin-bottom: ${({ theme }) => theme.spacing.md};
  font-size: 1rem;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text};
`;

const OptionContainer = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.md};
`;

const OptionCard = styled.button`
  border: 1px solid ${({ theme }) => theme.colors.lightGray};
  padding: ${({ theme }) => theme.spacing.md};
  cursor: pointer;
  flex: 1;
  text-align: center;
  background-color: white;
  border-radius: ${({ theme }) => theme.borderRadius.medium};
  display: flex;
  flex-direction: column;
  align-items: center;
  transition: ${({ theme }) => theme.transition};

  &:hover {
    background-color: ${({ theme }) => theme.colors.lightGray};
    transform: translateY(-2px);
    box-shadow: ${({ theme }) => theme.boxShadow};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const OptionIcon = styled.div`
  font-size: 2rem;
  margin-bottom: ${({ theme }) => theme.spacing.sm};
`;

const OptionTitle = styled.div`
  font-size: 1.1rem;
  font-weight: 600;
  margin-bottom: ${({ theme }) => theme.spacing.xs};
  color: ${({ theme }) => theme.colors.text};
`;

const OptionDescription = styled.div`
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.darkGray};
`;

export default WalletConnectModal; 
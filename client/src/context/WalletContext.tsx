import React, { createContext, FC, ReactNode, useMemo, useContext, useState, useEffect } from 'react';

// Define Phantom wallet types
declare global {
  interface Window {
    solana?: {
      isPhantom?: boolean;
      connect: () => Promise<{ publicKey: { toString: () => string } }>;
      disconnect: () => Promise<void>;
      on: (event: string, callback: (...args: any[]) => void) => void;
      publicKey?: { toString: () => string };
      isConnected?: boolean;
    };
  }
}

interface WalletContextType {
  connect: () => Promise<string | null>;
  disconnect: () => Promise<void>;
  publicKey: string | null;
  connected: boolean;
  isPhantomInstalled: boolean;
}

const WalletContext = createContext<WalletContextType | null>(null);

export const useWalletConnection = () => {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWalletConnection must be used within a WalletContextProvider');
  }
  return context;
};

export const WalletContextProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [connected, setConnected] = useState<boolean>(false);
  const [isPhantomInstalled, setIsPhantomInstalled] = useState<boolean>(false);

  // Check if Phantom is installed
  useEffect(() => {
    const checkPhantomWallet = () => {
      if (window.solana?.isPhantom) {
        setIsPhantomInstalled(true);
        // If wallet is already connected, set state accordingly
        if (window.solana.isConnected && window.solana.publicKey) {
          setPublicKey(window.solana.publicKey.toString());
          setConnected(true);
        }
      } else {
        setIsPhantomInstalled(false);
      }
    };

    checkPhantomWallet();
    
    // Optional: Listen for account changes
    if (window.solana) {
      window.solana.on('accountChanged', () => {
        if (window.solana?.publicKey) {
          setPublicKey(window.solana.publicKey.toString());
        } else {
          // Disconnected
          setPublicKey(null);
          setConnected(false);
        }
      });
    }
  }, []);

  const getProvider = () => {
    if ("solana" in window) {
      const provider = window.solana;
      if (provider?.isPhantom) {
        return provider;
      }
    }
    // Redirect to Phantom's website if wallet not found
    window.open("https://phantom.app/", "_blank");
    return null;
  };

  const connect = async (): Promise<string | null> => {
    try {
      const provider = getProvider();
      if (!provider) {
        throw new Error("Phantom wallet not found");
      }

      const response = await provider.connect();
      const walletPublicKey = response.publicKey.toString();
      
      setPublicKey(walletPublicKey);
      setConnected(true);
      
      console.log("Connected to Phantom wallet: ", walletPublicKey);
      return walletPublicKey;
    } catch (error) {
      console.error("Error connecting to Phantom wallet:", error);
      return null;
    }
  };

  const disconnect = async (): Promise<void> => {
    try {
      const provider = getProvider();
      if (provider) {
        await provider.disconnect();
        setPublicKey(null);
        setConnected(false);
        console.log("Disconnected from Phantom wallet");
      }
    } catch (error) {
      console.error("Error disconnecting from Phantom wallet:", error);
    }
  };

  const value = useMemo(() => ({
    connect,
    disconnect,
    publicKey,
    connected,
    isPhantomInstalled,
  }), [publicKey, connected, isPhantomInstalled]);

  return (
    <WalletContext.Provider value={value}>
      {children}
    </WalletContext.Provider>
  );
}; 
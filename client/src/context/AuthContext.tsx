import React, { createContext, useState, useEffect, useContext } from 'react';
import axios from 'axios';

interface User {
  _id: string;
  username: string;
  walletAddress?: string;
  isGuest?: boolean;
  token: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  connectWallet: (walletAddress: string) => Promise<void>;
  continueAsGuest: () => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';

  // Configure axios defaults
  axios.defaults.withCredentials = true;

  // Load user from localStorage on initial render
  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        setUser(parsedUser);
        // Set axios default header
        axios.defaults.headers.common['Authorization'] = `Bearer ${parsedUser.token}`;
      } catch (error) {
        localStorage.removeItem('user');
      }
    }
    setLoading(false);
  }, []);

  const connectWallet = async (walletAddress: string) => {
    try {
      setLoading(true);
      setError(null);

      // For demo purposes, we'll create a simple username from the wallet address
      const username = `${walletAddress.slice(0, 5)}...${walletAddress.slice(-3)}`;

      // In a real application, you would verify the wallet signature
      // Here we're simply creating a user based on the wallet address
      const response = await axios.post(`${API_URL}/users/wallet-auth`, {
        walletAddress,
        username,
      });

      const userData = response.data;
      setUser({
        ...userData,
        walletAddress,
      });
      
      // Set axios default header
      axios.defaults.headers.common['Authorization'] = `Bearer ${userData.token}`;
      
      // Store user in localStorage
      localStorage.setItem('user', JSON.stringify({
        ...userData,
        walletAddress,
      }));
    } catch (error: any) {
      console.error('Wallet Auth Error:', error);
      const message = error.response?.data?.message || 'Wallet authentication failed. Please try again.';
      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  };

  const continueAsGuest = async () => {
    try {
      setLoading(true);
      setError(null);

      // Generate a random guest ID
      const guestId = `guest_${Math.random().toString(36).substring(2, 10)}`;
      
      // In a real application, you would have a guest auth endpoint
      // Here we're creating a temporary guest user
      const guestUser = {
        _id: guestId,
        username: 'Guest User',
        isGuest: true,
        token: `guest_token_${guestId}`,
      };

      setUser(guestUser);
      
      // Store user in localStorage
      localStorage.setItem('user', JSON.stringify(guestUser));
    } catch (error: any) {
      console.error('Guest Auth Error:', error);
      const message = 'Guest mode failed. Please try again.';
      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      setLoading(true);
      
      // Only call logout endpoint for non-guest users
      if (user && !user.isGuest) {
        await axios.post(`${API_URL}/users/logout`);
      }
      
      // Clear user state
      setUser(null);
      
      // Remove axios default header
      delete axios.defaults.headers.common['Authorization'];
      
      // Remove user from localStorage
      localStorage.removeItem('user');
    } catch (error: any) {
      console.error('Logout API Error:', error);
      const message = error.response?.data?.message || 'Logout failed. Please try again.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const clearError = () => {
    setError(null);
  };

  const value = {
    user,
    loading,
    error,
    connectWallet,
    continueAsGuest,
    logout,
    clearError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}; 
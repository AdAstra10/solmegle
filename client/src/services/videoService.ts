import { io, Socket } from 'socket.io-client';
import SimplePeer from 'simple-peer';

// Types
export interface PeerData {
  userId: string;
  username: string;
  socketId: string;
}

export interface IceServers {
  iceServers: Array<{ 
    urls: string | string[];
    username?: string;
    credential?: string;
  }>;
}

interface SessionStartData {
  sessionId: string;
  peer: PeerData;
  iceServers: IceServers;
}

interface MessageData {
  sessionId: string;
  sender: string;
  message: string;
  timestamp: Date;
}

interface SignalData {
  sessionId: string;
  from: string;
  signal: SimplePeer.SignalData;
}

export interface VideoService {
  connect: () => void;
  disconnect: () => void;
  joinQueue: (userId: string, username: string) => void;
  leaveQueue: (userId: string) => void;
  endSession: (sessionId: string, userId: string) => void;
  sendMessage: (sessionId: string, sender: string, message: string) => void;
  onQueueJoined: (callback: (data: { position: number; estimatedWaitTime: number }) => void) => void;
  onSessionStart: (callback: (data: SessionStartData) => void) => void;
  onSessionEnded: (callback: (data: { sessionId: string; initiator: string }) => void) => void;
  onSignal: (callback: (data: SignalData) => void) => void;
  onMessageReceived: (callback: (data: MessageData) => void) => void;
  onError: (callback: (data: { message: string }) => void) => void;
  sendSignal: (sessionId: string, to: string, signal: SimplePeer.SignalData) => void;
}

export const createVideoService = (serverUrl: string = 'http://localhost:5000'): VideoService => {
  let socket: Socket | null = null;

  const connect = (): void => {
    if (!socket) {
      socket = io(serverUrl, {
        transports: ['websocket'],
        withCredentials: true,
      });

      socket.on('connect', () => {
        console.log('Socket connected');
      });

      socket.on('disconnect', () => {
        console.log('Socket disconnected');
      });

      socket.on('connect_error', (error) => {
        console.error('Connection error:', error);
      });
    }
  };

  const disconnect = (): void => {
    if (socket) {
      socket.disconnect();
      socket = null;
    }
  };

  const joinQueue = (userId: string, username: string): void => {
    if (socket) {
      socket.emit('queue:join', { userId, username });
    } else {
      console.error('Socket not connected');
    }
  };

  const leaveQueue = (userId: string): void => {
    if (socket) {
      socket.emit('queue:leave', { userId });
    } else {
      console.error('Socket not connected');
    }
  };

  const endSession = (sessionId: string, userId: string): void => {
    if (socket) {
      socket.emit('session:end', { sessionId, userId });
    } else {
      console.error('Socket not connected');
    }
  };

  const sendMessage = (sessionId: string, sender: string, message: string): void => {
    if (socket) {
      socket.emit('chat:message', { sessionId, sender, message });
    } else {
      console.error('Socket not connected');
    }
  };

  const sendSignal = (sessionId: string, to: string, signal: SimplePeer.SignalData): void => {
    if (socket) {
      socket.emit('signal', { sessionId, to, signal });
    } else {
      console.error('Socket not connected');
    }
  };

  const onQueueJoined = (callback: (data: { position: number; estimatedWaitTime: number }) => void): void => {
    if (socket) {
      socket.on('queue:joined', callback);
    } else {
      console.error('Socket not connected');
    }
  };

  const onSessionStart = (callback: (data: SessionStartData) => void): void => {
    if (socket) {
      socket.on('session:start', callback);
    } else {
      console.error('Socket not connected');
    }
  };

  const onSessionEnded = (callback: (data: { sessionId: string; initiator: string }) => void): void => {
    if (socket) {
      socket.on('session:ended', callback);
    } else {
      console.error('Socket not connected');
    }
  };

  const onSignal = (callback: (data: SignalData) => void): void => {
    if (socket) {
      socket.on('signal', callback);
    } else {
      console.error('Socket not connected');
    }
  };

  const onMessageReceived = (callback: (data: MessageData) => void): void => {
    if (socket) {
      socket.on('chat:message', callback);
    } else {
      console.error('Socket not connected');
    }
  };

  const onError = (callback: (data: { message: string }) => void): void => {
    if (socket) {
      socket.on('error', callback);
    } else {
      console.error('Socket not connected');
    }
  };

  return {
    connect,
    disconnect,
    joinQueue,
    leaveQueue,
    endSession,
    sendMessage,
    sendSignal,
    onQueueJoined,
    onSessionStart,
    onSessionEnded,
    onSignal,
    onMessageReceived,
    onError,
  };
}; 
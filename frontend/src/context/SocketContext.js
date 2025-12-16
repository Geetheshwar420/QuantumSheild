import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import io from 'socket.io-client';

const SocketContext = createContext(null);

const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || 'http://localhost:3001'; // Development only - use HTTPS in production
export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef(null);
  const lifecycleListenersRef = useRef(new Map()); // Track socket-level lifecycle event handlers
  const managerListenersRef = useRef(new Map()); // Track manager-level event handlers

  const connectSocket = useCallback((token, userId) => {
    if (socketRef.current?.connected) {
      console.log('Socket already connected');
      return;
    }

    // Clean up existing socket if present
    if (socketRef.current) {
      // Remove socket-level lifecycle listeners
      const listeners = lifecycleListenersRef.current;
      listeners.forEach((handler, event) => {
        socketRef.current.off(event, handler);
      });
      listeners.clear();
      
      // Remove manager-level listeners
      const managerListeners = managerListenersRef.current;
      managerListeners.forEach((handler, event) => {
        socketRef.current.io.off(event, handler);
      });
      managerListeners.clear();
      
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    console.log('Connecting socket with auth...');
    
    // Create socket with authentication
    const newSocket = io(SOCKET_URL, {
      auth: {
        token,
        userId
      },
      query: {
        userId
      },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    });

    // Define and track lifecycle event handlers
    const onConnect = () => {
      console.log('Socket connected:', newSocket.id);
      setIsConnected(true);
    };

    const onDisconnect = (reason) => {
      console.log('Socket disconnected:', reason);
      setIsConnected(false);
    };

    const onConnectError = (error) => {
      console.error('Socket connection error:', error);
      setIsConnected(false);
    };

    const onReconnect = (attemptNumber) => {
      console.log('Socket reconnected after', attemptNumber, 'attempts');
      setIsConnected(true);
      // Optional: Request unread messages after reconnection
      // newSocket.emit('getUnreadMessages');
    };

    const onReconnectError = (error) => {
      console.error('Socket reconnection error:', error);
    };

    const onReconnectFailed = () => {
      console.error('Socket reconnection failed');
      setIsConnected(false);
    };

    // Register socket-level lifecycle event handlers
    newSocket.on('connect', onConnect);
    newSocket.on('disconnect', onDisconnect);
    newSocket.on('connect_error', onConnectError);

    // Register manager-level event handlers (Socket.IO v4+)
    newSocket.io.on('reconnect', onReconnect);
    newSocket.io.on('reconnect_error', onReconnectError);
    newSocket.io.on('reconnect_failed', onReconnectFailed);

    // Store socket-level handlers for cleanup
    lifecycleListenersRef.current.set('connect', onConnect);
    lifecycleListenersRef.current.set('disconnect', onDisconnect);
    lifecycleListenersRef.current.set('connect_error', onConnectError);

    // Store manager-level handlers for cleanup
    managerListenersRef.current.set('reconnect', onReconnect);
    managerListenersRef.current.set('reconnect_error', onReconnectError);
    managerListenersRef.current.set('reconnect_failed', onReconnectFailed);

    socketRef.current = newSocket;
    setSocket(newSocket);
  }, []);  const disconnectSocket = useCallback(() => {
    if (socketRef.current) {
      console.log('Disconnecting socket...');
      
      // Remove socket-level lifecycle listeners
      const listeners = lifecycleListenersRef.current;
      listeners.forEach((handler, event) => {
        socketRef.current.off(event, handler);
      });
      listeners.clear();
      
      // Remove manager-level listeners
      const managerListeners = managerListenersRef.current;
      managerListeners.forEach((handler, event) => {
        socketRef.current.io.off(event, handler);
      });
      managerListeners.clear();
      
      // Disconnect and clean up
      socketRef.current.disconnect();
      socketRef.current = null;
      setSocket(null);
      setIsConnected(false);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnectSocket();
    };
  }, [disconnectSocket]);

  const value = {
    socket,
    isConnected,
    connectSocket,
    disconnectSocket
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
};

// Custom hook to use socket
export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};

export const useSocketEvent = (eventName, handler) => {
  const { socket } = useSocket();
  const handlerRef = useRef(handler);
  
  // Keep the ref updated with latest handler on every render
  handlerRef.current = handler;

  useEffect(() => {
    if (!socket) return;

    const eventHandler = (...args) => handlerRef.current(...args);
    socket.on(eventName, eventHandler);

    return () => {
      socket.off(eventName, eventHandler);
    };
  }, [socket, eventName]);
};

export default SocketContext;

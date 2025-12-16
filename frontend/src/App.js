import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { SocketProvider } from './context/SocketContext';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ChatDashboard from './pages/ChatDashboard';
import { tryRestoreSession, cleanupExpiredMessages } from './utils/crypto';
import './App.css';

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState(null);
  const [darkMode] = useState(false);

  useEffect(() => {
    const initializeApp = async () => {
      // Check if user is already logged in
      const savedUser = localStorage.getItem('user');
      const token = localStorage.getItem('token');
      
      if (savedUser && token) {
        try {
          const parsedUser = JSON.parse(savedUser);
          
          // Try to restore session from sessionStorage
          const sessionRestored = await tryRestoreSession();
          if (sessionRestored) {
            console.log('✓ Session restored successfully');
          }
          
          setUser(parsedUser);
          setIsLoggedIn(true);
        } catch (error) {
          // Handle corrupted or invalid JSON data
          console.error('Failed to parse saved user data:', error);
          // Clear corrupted data to prevent repeated failures
          localStorage.removeItem('user');
          localStorage.removeItem('token');
          // App continues with logged-out state
        }
      }
      
      // Cleanup expired offline messages (runs on app start)
      try {
        await cleanupExpiredMessages();
      } catch (error) {
        console.warn('Failed to cleanup expired messages:', error);
      }
    };
    
    initializeApp();
    
    // Periodic cleanup of expired messages (every 5 minutes)
    const cleanupInterval = setInterval(() => {
      cleanupExpiredMessages().catch(err => 
        console.warn('Periodic message cleanup failed:', err)
      );
    }, 5 * 60 * 1000);
    
    return () => clearInterval(cleanupInterval);
  }, []);

  return (
    <SocketProvider>
      <div className={`${darkMode ? 'dark' : ''} min-h-screen transition-colors duration-300`}>
        <Router>
          <Routes>
            <Route 
              path="/login" 
              element={<LoginPage setIsLoggedIn={setIsLoggedIn} setUser={setUser} />} 
            />
            <Route 
              path="/register" 
              element={<RegisterPage />} 
            />
            <Route 
              path="/chat" 
              element={isLoggedIn ? <ChatDashboard user={user} setIsLoggedIn={setIsLoggedIn} setUser={setUser} /> : <LoginPage setIsLoggedIn={setIsLoggedIn} setUser={setUser} />} 
            />
            <Route 
              path="/" 
              element={isLoggedIn ? <ChatDashboard user={user} setIsLoggedIn={setIsLoggedIn} setUser={setUser} /> : <LoginPage setIsLoggedIn={setIsLoggedIn} setUser={setUser} />} 
            />
          </Routes>
        </Router>
      </div>
    </SocketProvider>
  );
}

export default App;

import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import io from 'socket.io-client';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ChatDashboard from './pages/ChatDashboard';
import './App.css';

const socket = io('http://localhost:3001');

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState(null);
  const [darkMode] = useState(false);

  useEffect(() => {
    // Check if user is already logged in
    const savedUser = localStorage.getItem('user');
    const token = localStorage.getItem('token');
    if (savedUser && token) {
      setUser(JSON.parse(savedUser));
      setIsLoggedIn(true);
    }
  }, []);

  return (
    <div className={`${darkMode ? 'dark' : ''} min-h-screen transition-colors duration-300`}>
      <Router>
        <Routes>
          <Route 
            path="/login" 
            element={<LoginPage setIsLoggedIn={setIsLoggedIn} setUser={setUser} socket={socket} />} 
          />
          <Route 
            path="/register" 
            element={<RegisterPage socket={socket} />} 
          />
          <Route 
            path="/chat" 
            element={isLoggedIn ? <ChatDashboard user={user} socket={socket} /> : <LoginPage setIsLoggedIn={setIsLoggedIn} setUser={setUser} socket={socket} />} 
          />
          <Route 
            path="/" 
            element={isLoggedIn ? <ChatDashboard user={user} socket={socket} /> : <LoginPage setIsLoggedIn={setIsLoggedIn} setUser={setUser} socket={socket} />} 
          />
        </Routes>
      </Router>
    </div>
  );
}

export default App;

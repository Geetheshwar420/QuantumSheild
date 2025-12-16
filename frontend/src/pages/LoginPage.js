import React, { useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { useNavigate, Link } from 'react-router-dom';
import { useSocket } from '../context/SocketContext';
import { initializeSecureKeys } from '../utils/crypto';

// Normalize API_URL: strip trailing slashes and remove trailing "/api" if present
const API_URL = (process.env.REACT_APP_API_URL || 'http://localhost:3001')
  .replace(/\/+$/, '') // Remove trailing slashes
  .replace(/\/api$/, ''); // Remove trailing "/api" if present

const LoginPage = ({ setIsLoggedIn, setUser }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { connectSocket } = useSocket();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      let loginResponse;
      if (!password) {
        setError('Password is required');
        return;
      }
      // Password-based login
      loginResponse = await axios.post(`${API_URL}/api/auth/login`, { username, password });

      // Save token and user to localStorage
      const { token, userId, keys } = loginResponse.data;
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify({ id: userId, username }));
      
      // Store public keys and securely persist secrets
      if (keys) {
        // Secret keys are included in login response for one-time retrieval
        const kyberSecretKey = keys.kyberSecretKey;
        const falconSecretKey = keys.falconSecretKey;
        
        // Validate secret keys exist before initializing secure storage
        if (!kyberSecretKey || typeof kyberSecretKey !== 'string' || kyberSecretKey.trim() === '') {
          console.error('Invalid or missing Kyber secret key');
          setError('Invalid encryption keys received from server');
          setLoading(false);
          return;
        }

        if (!falconSecretKey || typeof falconSecretKey !== 'string' || falconSecretKey.trim() === '') {
          console.error('Invalid or missing Falcon secret key');
          setError('Invalid signature keys received from server');
          setLoading(false);
          return;
        }

        await initializeSecureKeys(username, password, {
          kyberSecretKey,
          falconSecretKey,
          kyberPublicKey: keys.kyberPublicKey,
          falconPublicKey: keys.falconPublicKey
        });

        console.log(`✓ Keys securely initialized for user: ${username}`);
      }

      setIsLoggedIn(true);
      setUser({ id: userId, username });

      console.log('Login complete, session initialized. Navigating to chat...');

      // Connect socket with authentication after successful login (non-blocking)
      try {
        connectSocket(token, userId);
      } catch (socketError) {
        console.error('Socket connection failed:', socketError);
        // User is still logged in, socket will retry via context
      }

      // Small delay to ensure state updates propagate before navigation
      await new Promise(resolve => setTimeout(resolve, 100));
      
      navigate('/chat', { replace: true });
    } catch (err) {
      setError(err.response?.data?.msg || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Animated background blobs */}
      <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-gradient-to-br from-whatsapp.accent/40 to-whatsapp.primary/40 blur-3xl animate-blob" />
      <div className="pointer-events-none absolute top-1/2 -right-24 h-80 w-80 rounded-full bg-gradient-to-br from-cyan-400/40 to-blue-500/40 blur-3xl animate-blob" />
      <div className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2 h-72 w-72 rounded-full bg-gradient-to-br from-purple-400/40 to-pink-400/40 blur-3xl animate-blob" />

      <div className="min-h-screen flex items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
          className="glass-card w-full max-w-md p-8"
        >
          <div className="mb-6 text-center">
            <h1 className="text-3xl font-bold text-gray-900">QuantumShield</h1>
            <p className="text-sm text-gray-600 mt-1">Post-quantum secure chat</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="relative">
              <input
                type="text"
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-gray-100 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-whatsapp.primary"
              />
              <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-gray-400">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 12c2.761 0 5-2.239 5-5S14.761 2 12 2 7 4.239 7 7s2.239 5 5 5Zm0 2c-3.866 0-7 2.239-7 5v1h14v-1c0-2.761-3.134-5-7-5Z" fill="currentColor"/>
                </svg>
              </div>
            </div>

            <div className="relative">
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-xl bg-gray-100 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-whatsapp.primary"
              />
              <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-gray-400">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M17 8V7a5 5 0 1 0-10 0v1H5v12h14V8h-2Zm-8 0V7a3 3 0 1 1 6 0v1H9Zm1 5h4v5h-4v-5Z" fill="currentColor"/>
                </svg>
              </div>
            </div>

            {error && (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-red-600 text-sm font-medium">
                {error}
              </motion.p>
            )}

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="submit"
              disabled={loading}
              className="relative z-10 w-full py-3.5 rounded-xl bg-gradient-to-r from-green-600 to-green-500 text-white font-bold text-base shadow-lg hover:shadow-2xl hover:from-green-700 hover:to-green-600 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed border-2 border-green-700"
            >
              {loading ? 'Logging in…' : 'Sign in'}
            </motion.button>
          </form>

          <div className="mt-6 text-center text-sm text-gray-600">
            New here?{' '}
            <Link to="/register" className="text-whatsapp.dark hover:underline">Create an account</Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default LoginPage;

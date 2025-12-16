import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useSocket, useSocketEvent } from '../context/SocketContext';
import { encryptAndSignMessage, verifyAndDecryptMessage, encryptAndSignFile, verifyAndDecryptFile, getSecretKeys, hasSecretKeys, getPublicKeys } from '../utils/crypto';

// Normalize API_URL: strip trailing slashes and remove trailing "/api" if present
// This ensures we can safely append "/api/..." to construct endpoints
const API_URL = (() => {
  const envUrl = process.env.REACT_APP_API_URL;
  if (envUrl && envUrl.trim()) return envUrl.trim();
  if (process.env.NODE_ENV === 'production') {
    throw new Error('REACT_APP_API_URL is not set for production build');
  }
  return 'http://localhost:3001';
})()
  .replace(/\/+$/, '') // Remove trailing slashes
  .replace(/\/api$/, ''); // Remove trailing "/api" if present

if (process.env.NODE_ENV === 'development') {
  console.log('ChatDashboard API_URL:', API_URL);
}

const ChatDashboard = ({ user, setIsLoggedIn, setUser }) => {
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState('');
  const [selectedContact, setSelectedContact] = useState(null); // { friend_id, username }
  const [friends, setFriends] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [showFriendRequest, setShowFriendRequest] = useState(false);
  const [searchUsername, setSearchUsername] = useState('');
  const [friendSearch, setFriendSearch] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileTransferStatus, setFileTransferStatus] = useState('');
  const [pendingFiles, setPendingFiles] = useState([]); // List of decrypted files awaiting user action
  const [hasKeys, setHasKeys] = useState(false);
  const navigate = useNavigate();
  const token = localStorage.getItem('token');
  const { socket, isConnected, connectSocket, disconnectSocket } = useSocket();
  const selectedContactRef = useRef(selectedContact); // Track latest selectedContact for socket handler
  const userRef = useRef(user); // Track latest user to avoid stale closures
  const recipientKeysCache = useRef({}); // Cache for recipient public keys by friend_id
  const publicKeyCache = useRef(new Map()); // Cache for sender public keys (for signature verification)
  const senderPublicKeyCache = useRef(new Map()); // Cache for sender public keys in file transfers (keyed by senderId)

  // Keep ref updated with latest selectedContact and user
  useEffect(() => {
    selectedContactRef.current = selectedContact;
  }, [selectedContact]);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const fetchFriends = useCallback(async () => {
    if (!token) {
      console.warn('Skipping fetchFriends: no token in storage');
      return;
    }
    try {
      const response = await axios.get(`${API_URL}/api/friends/list`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setFriends(response.data.friends || []);
    } catch (err) {
      console.error('Failed to fetch friends:', err);
    }
  }, [token]);

  const fetchPendingRequests = useCallback(async () => {
    if (!token) {
      console.warn('Skipping fetchPendingRequests: no token in storage');
      return;
    }
    try {
      const response = await axios.get(`${API_URL}/api/friends/requests/pending`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPendingRequests(response.data.pending_requests || []);
    } catch (err) {
      console.error('Failed to fetch pending requests:', err);
    }
  }, [token]);

  useEffect(() => {
    if (!token) {
      navigate('/login');
      return;
    }

    if (!user) {
      navigate('/login');
      return;
    }

    // Check secure keystore
    (async () => {
      try {
        const hasSecrets = await hasSecretKeys(user.username);
        const pub = await getPublicKeys(user.username);
        const ok = !!hasSecrets && !!pub.kyberPublicKey && !!pub.falconPublicKey;
        setHasKeys(ok);
        if (!ok) {
          setError(`⚠️ Missing encryption keys for ${user.username}. Please log out and log in again to retrieve your keys.`);
        }
      } catch (e) {
        console.error('Keystore check failed', e);
        setError('Key storage unavailable; please re-login');
      }
    })();

    // Connect socket if not already connected
    if (!isConnected && token && user.id) {
      connectSocket(token, user.id);
    }

    // Fetch friends list and pending requests
    fetchFriends();
    fetchPendingRequests();
  }, [user, navigate, isConnected, token, connectSocket, fetchFriends, fetchPendingRequests]);

  // Socket event listeners using custom hook
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useSocketEvent('receiveMessage', useCallback(async (data) => {
    console.log('📨 receiveMessage event received:', {
      senderId: data.senderId,
      receiverId: data.receiverId,
      currentUser: userRef.current?.id,
      selectedContact: selectedContactRef.current?.friend_id,
      hasKyberCiphertext: !!data.kyberCiphertext,
      hasEncryptedMessage: !!data.encryptedMessage,
      hasIv: !!data.iv,
      hasAuthTag: !!data.authTag,
      hasSignature: !!data.signature,
      fullData: data
    });
    
    // Only append messages for the currently selected contact
    const currentContact = selectedContactRef.current;
    if (!currentContact) {
      console.log('⚠️ No contact selected, ignoring message');
      return; // No contact selected, ignore message
    }
    
    // Check if message is from or to the selected contact
    const isRelevantMessage = 
      data.senderId === currentContact.friend_id || 
      data.receiverId === currentContact.friend_id;
    
    console.log('🔍 Message relevance check:', {
      isRelevantMessage,
      senderMatches: data.senderId === currentContact.friend_id,
      receiverMatches: data.receiverId === currentContact.friend_id
    });
    
    if (isRelevantMessage) {
      try {
        console.log('🔐 Starting message decryption...');
        
        // Use user from ref (current, not stale) - unified data source
        const currentUser = userRef.current;
        if (!currentUser || !currentUser.username) {
          console.error('User not available for decryption');
          setError('Cannot decrypt message: User not authenticated');
          return;
        }

        const userKeys = await getSecretKeys();

        if (!userKeys.kyberSecretKey || !userKeys.falconSecretKey) {
          console.error('Missing user keys for decryption');
          setError('Cannot decrypt message: Missing keys');
          return;
        }

        // Get sender's public key for signature verification (use cache first)
        console.log(`📡 Fetching sender's public key (ID: ${data.senderId})...`);
        
        let senderPublicKey;
        
        // Check if sender's public key is already cached
        if (publicKeyCache.current.has(data.senderId)) {
          senderPublicKey = publicKeyCache.current.get(data.senderId);
          console.log('✓ Sender public key retrieved from cache');
        } else {
          // Fetch from API only if not cached
          const senderResponse = await axios.get(`${API_URL}/api/users/${data.senderId}/keys`);
          senderPublicKey = senderResponse.data.falconPublicKey;
          // Cache the public key for future messages from this sender
          publicKeyCache.current.set(data.senderId, senderPublicKey);
          console.log('✓ Sender public key retrieved from API and cached');
        }

        // Create message bundle for decryption
        const messageBundle = {
          kyberCiphertext: data.kyberCiphertext,
          encryptedMessage: data.encryptedMessage,
          iv: data.iv,
          authTag: data.authTag,
          signature: data.signature
        };

        // Decrypt the message
        console.log('🔓 Decrypting message...');
        const decryptedText = await verifyAndDecryptMessage(
          messageBundle,
          userKeys.kyberSecretKey,
          senderPublicKey
        );
        
        console.log('✓ Message decrypted successfully');

        // Create message object with decrypted text
        const decryptedMessage = {
          ...data,
          message: decryptedText // Replace encrypted message with decrypted text
        };

        setMessages((prev) => [...prev, decryptedMessage]);
        console.log('✓ Message added to chat');
      } catch (err) {
        console.error('Message decryption failed:', err);
        setError('Failed to decrypt message');
      }
    }
  }, [])); // No deps needed - uses refs for latest selectedContact and user

  useSocketEvent('friendRequestReceived', useCallback(() => {
    fetchPendingRequests(); // Refresh pending requests
  }, [fetchPendingRequests]));

  useSocketEvent('messageError', useCallback((data) => {
    setError(data.error);
  }, []));

  // Download a file from pending files list (user action)
  const handleDownloadFile = useCallback((fileId) => {
    setPendingFiles((prev) => {
      const file = prev.find((f) => f.id === fileId);
      if (!file) return prev;

      // Use existing blob URL or create new one
      const url = file.blobUrl || window.URL.createObjectURL(file.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.fileName;
      document.body.appendChild(a);
      a.click();
      
      // Revoke blob URL to free memory
      if (file.blobUrl) {
        window.URL.revokeObjectURL(file.blobUrl);
      } else {
        window.URL.revokeObjectURL(url);
      }
      document.body.removeChild(a);

      console.log(`✓ File "${file.fileName}" downloaded by user`);

      // Remove from pending files after download
      return prev.filter((f) => f.id !== fileId);
    });

    setFileTransferStatus('File downloaded successfully');
    setTimeout(() => setFileTransferStatus(''), 3000);
  }, []);

  // Decline/delete a file from pending files list (user action)
  const handleDeclineFile = useCallback((fileId) => {
    setPendingFiles((prev) => {
      const file = prev.find((f) => f.id === fileId);
      if (!file) return prev;
      
      // Revoke blob URL to prevent memory leak
      if (file.blobUrl) {
        window.URL.revokeObjectURL(file.blobUrl);
      }
      
      console.log(`✓ File "${file.fileName}" declined by user`);
      return prev.filter((f) => f.id !== fileId);
    });
  }, []);

  useSocketEvent('receiveFile', useCallback(async (data) => {
    console.log('📁 receiveFile event received:', {
      senderId: data.senderId,
      receiverId: data.receiverId,
      fileName: data.fileName,
      fileSize: data.fileSize,
      currentContact: selectedContactRef.current?.friend_id
    });

    const currentContact = selectedContactRef.current;
    if (!currentContact) {
      console.log('⚠️ No contact selected, ignoring file');
      return;
    }

    const isRelevantFile = 
      data.senderId === currentContact.friend_id || 
      data.receiverId === currentContact.friend_id;

    if (isRelevantFile) {
      try {
        const currentUser = userRef.current;
        if (!currentUser || !currentUser.username) {
          console.error('User not available for file decryption');
          setError('Cannot decrypt file: User not authenticated');
          return;
        }

        const userKeys = await getSecretKeys();
        if (!userKeys.kyberSecretKey) {
          console.error('Missing user keys for file decryption');
          setError('Cannot decrypt file: Missing keys');
          return;
        }

        // Fetch sender's public key with cache-first lookup
        console.log(`🔐 Fetching sender's public key for file verification (ID: ${data.senderId})...`);
        let senderPublicKey;
        
        if (senderPublicKeyCache.current.has(data.senderId)) {
          senderPublicKey = senderPublicKeyCache.current.get(data.senderId);
          console.log('✓ Sender public key retrieved from cache (file transfer)');
        } else {
          const senderResponse = await axios.get(`${API_URL}/api/users/${data.senderId}/keys`);
          senderPublicKey = senderResponse.data.falconPublicKey;
          senderPublicKeyCache.current.set(data.senderId, senderPublicKey);
          console.log('✓ Sender public key retrieved from API and cached (file transfer)');
        }

        const fileBundle = {
          kyberCiphertext: data.kyberCiphertext,
          fileData: data.fileData,
          iv: data.iv,
          authTag: data.authTag,
          signature: data.signature,
          fileName: data.fileName,
          fileType: data.fileType
        };

        const { blob, fileName } = await verifyAndDecryptFile(
          fileBundle,
          userKeys.kyberSecretKey,
          senderPublicKey
        );

        console.log(`✓ File "${fileName}" decrypted successfully, awaiting user action`);

        // Create blob URL for preview/download (will be revoked when file is declined or downloaded)
        const blobUrl = URL.createObjectURL(blob);

        // Add decrypted file to pending files (user consent required)
        const fileId = `${data.senderId}_${data.timestamp}`;
        setPendingFiles((prev) => [
          ...prev,
          {
            id: fileId,
            blob,
            blobUrl, // Store blob URL for proper cleanup
            fileName,
            fileType: data.fileType,
            fileSize: data.fileSize,
            senderId: data.senderId,
            senderName: selectedContactRef.current?.username || `User ${data.senderId}`,
            timestamp: data.timestamp
          }
        ]);

        setFileTransferStatus(`File "${fileName}" received. Review it in the pending files list.`);
        setTimeout(() => setFileTransferStatus(''), 5000);

        // Add file message to chat indicating it's pending user action
        setMessages((prev) => [
          ...prev,
          {
            senderId: data.senderId,
            message: `📎 File: ${fileName} (${(data.fileSize / 1024).toFixed(2)} KB) - Pending your action`,
            timestamp: data.timestamp,
            isFile: true,
            isPending: true
          }
        ]);
      } catch (err) {
        console.error('File decryption failed:', err);
        setError('Failed to decrypt file: ' + (err.message || 'Unknown error'));
      }
    }
  }, []));

  useSocketEvent('fileDelivered', useCallback((data) => {
    setFileTransferStatus(`File delivered at ${new Date(data.timestamp).toLocaleTimeString()}`);
    setTimeout(() => setFileTransferStatus(''), 5000);
  }, []));

  useSocketEvent('fileError', useCallback((data) => {
    setError(data.error);
    setFileTransferStatus('');
  }, []));

  // Fetch message history when selectedContact changes
  useEffect(() => {
    // Messages are ephemeral (real-time only via Socket.IO)
    // No message history is stored or fetched
    const initializeChat = () => {
      if (!selectedContact) {
        // Clear messages when no contact is selected
        setMessages([]);
        return;
      }

      // Always start with empty messages (no history)
      // All messages are delivered in real-time only
      setMessages([]);
    };

    initializeChat();
  }, [selectedContact]); // Re-initialize when contact changes

  // Logout handler
  const handleLogout = useCallback(() => {
    // Disconnect socket
    disconnectSocket();
    
    // Clear localStorage
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    
    // Update state
    setIsLoggedIn(false);
    setUser(null);
    
    // Navigate to login
    navigate('/login');
  }, [disconnectSocket, setIsLoggedIn, setUser, navigate]);

  // moved into useCallback above

  const handleSendFriendRequest = async () => {
    if (!searchUsername) return;

    setLoading(true);
    setError('');

    try {
      await axios.post(
        `${API_URL}/api/friends/request`,
        { receiver_username: searchUsername },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSearchUsername('');
      setShowFriendRequest(false);
      // Optionally show success message
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to send friend request');
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptRequest = async (requestId) => {
    try {
      await axios.post(
        `${API_URL}/api/friends/request/${requestId}/accept`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      fetchPendingRequests();
      fetchFriends(); // Refresh friends list
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to accept request');
    }
  };

  const handleRejectRequest = async (requestId) => {
    try {
      await axios.post(
        `${API_URL}/api/friends/request/${requestId}/reject`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      fetchPendingRequests();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to reject request');
    }
  };

  const handleSendMessage = async () => {
    if (!messageText || !selectedContact || !socket || !user) return;

    try {
      // Get user's keys from localStorage (username-specific storage)
      const userKeys = await getSecretKeys();
      if (!userKeys.kyberSecretKey || !userKeys.falconSecretKey) {
        setError('❌ Cannot send message: Missing encryption keys. Please log out and log in again.');
        return;
      }

      // Get receiver's public keys (use cache to avoid redundant API calls)
      let receiverKeys = recipientKeysCache.current[selectedContact.friend_id];
      
      if (!receiverKeys) {
        // Only fetch from API if not cached
        const response = await axios.get(
          `${API_URL}/api/users/${selectedContact.friend_id}/keys`,
          { headers: { Authorization: `Bearer ${token}` } } // Use token constant, not localStorage
        );
        receiverKeys = response.data;
        // Cache the keys for future use (shared with file transfer handler)
        recipientKeysCache.current[selectedContact.friend_id] = receiverKeys;
      }

      if (!receiverKeys.kyberPublicKey || !receiverKeys.falconPublicKey) {
        setError('Could not retrieve recipient\'s encryption keys');
        return;
      }

      // Encrypt and sign the message with PQC
      const encrypted = await encryptAndSignMessage(
        messageText,
        receiverKeys.kyberPublicKey,
        userKeys.falconSecretKey
      );

      // Send encrypted message via socket
      socket.emit('sendMessage', {
        senderId: user.id,
        receiverId: selectedContact.friend_id,
        encryptedMessage: encrypted.encryptedMessage,
        kyberCiphertext: encrypted.kyberCiphertext,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        signature: encrypted.signature
      });

      // Add to local messages (plaintext for display)
      setMessages((prev) => [
        ...prev,
        {
          senderId: user.id,
          message: messageText, // Store plaintext for local display
          timestamp: new Date().toISOString(),
          isLocal: true // Mark as local message
        },
      ]);

      setMessageText('');
    } catch (err) {
      console.error('Failed to encrypt and send message:', err);
      setError('Failed to encrypt message. Check console for details.');
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Check file size (limit to 10MB for demo)
      if (file.size > 10 * 1024 * 1024) {
        setError('File size must be less than 10MB');
        return;
      }
      setSelectedFile(file);
      setError('');
    }
  };

  const handleSendFile = async () => {
    if (!selectedFile || !selectedContact || !socket || !user) return;

    try {
      setFileTransferStatus('Encrypting file...');
      
      const userKeys = await getSecretKeys();
      if (!userKeys.kyberSecretKey || !userKeys.falconSecretKey) {
        setError('❌ Cannot send file: Missing encryption keys. Please log out and log in again.');
        setFileTransferStatus('');
        return;
      }

      // Fetch recipient public keys (use cache to avoid redundant API calls)
      let receiverKeys = recipientKeysCache.current[selectedContact.friend_id];
      
      if (!receiverKeys) {
        // Only fetch from API if not cached
        const response = await axios.get(
          `${API_URL}/api/users/${selectedContact.friend_id}/keys`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        receiverKeys = response.data;
        // Cache the keys for future use
        recipientKeysCache.current[selectedContact.friend_id] = receiverKeys;
      }

      if (!receiverKeys.kyberPublicKey || !receiverKeys.falconPublicKey) {
        setError('Could not retrieve recipient\'s encryption keys');
        setFileTransferStatus('');
        return;
      }

      const encryptedFile = await encryptAndSignFile(
        selectedFile,
        receiverKeys.kyberPublicKey,
        userKeys.falconSecretKey
      );

      setFileTransferStatus('Sending file...');

      socket.emit('sendFile', {
        senderId: user.id,
        receiverId: selectedContact.friend_id,
        fileName: encryptedFile.fileName,
        fileSize: encryptedFile.fileSize,
        fileData: encryptedFile.fileData,
        kyberCiphertext: encryptedFile.kyberCiphertext,
        iv: encryptedFile.iv,
        authTag: encryptedFile.authTag,
        signature: encryptedFile.signature
      });

      // Add to local messages
      setMessages((prev) => [
        ...prev,
        {
          senderId: user.id,
          message: `📎 File: ${selectedFile.name} (${(selectedFile.size / 1024).toFixed(2)} KB)`,
          timestamp: new Date().toISOString(),
          isLocal: true,
          isFile: true
        }
      ]);

      setSelectedFile(null);
      // Reset file input
      const fileInput = document.getElementById('file-input');
      if (fileInput) fileInput.value = '';
      
    } catch (err) {
      console.error('Failed to encrypt and send file:', err);
      setError('Failed to encrypt file. Check console for details.');
      setFileTransferStatus('');
    }
  };

  const filteredFriends = useMemo(() => {
    if (!friendSearch) return friends;
    return friends.filter(f => f.username.toLowerCase().includes(friendSearch.toLowerCase()));
  }, [friends, friendSearch]);

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Top bar */}
      <div className="w-full bg-[#00a884] text-white">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-semibold">QuantumShield</span>
            {hasKeys ? (
              <span className="text-xs bg-green-600 px-2 py-1 rounded" title="Encryption enabled">🔒 E2EE Active</span>
            ) : (
              <span className="text-xs bg-yellow-600 px-2 py-1 rounded" title="Cannot send/receive encrypted messages">⚠️ No Keys</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="opacity-90 text-sm">{user?.username}</span>
            <button onClick={handleLogout} className="text-sm bg-white text-[#075e54] px-3 py-1 rounded">
              Logout
            </button>
          </div>
        </div>
      </div>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-[380px,1fr] h-[calc(100vh-64px)]"
      >
        {/* Friends & Requests Sidebar */}
        <div className="border-r bg-white overflow-hidden flex flex-col">
          {/* Search */}
          <div className="p-3">
            <input
              type="text"
              placeholder="Search or start new chat"
              value={friendSearch}
              onChange={(e) => setFriendSearch(e.target.value)}
              className="w-full px-4 py-2 rounded-lg bg-gray-100 text-gray-900 placeholder-gray-500 focus:outline-none"
            />
          </div>
          {/* Add Friend Section */}
          <div className="px-3">
            <button
              onClick={() => setShowFriendRequest(!showFriendRequest)}
              className="w-full px-3 py-2 bg-[#00a884] text-white rounded hover:bg-[#029974]"
            >
              {showFriendRequest ? 'Cancel' : 'Add Friend'}
            </button>
            {showFriendRequest && (
              <div className="mt-3 space-y-2">
                <input
                  type="text"
                  placeholder="Enter username..."
                  value={searchUsername}
                  onChange={(e) => setSearchUsername(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-gray-100 text-gray-900 placeholder-gray-500 focus:outline-none"
                />
                <button
                  onClick={handleSendFriendRequest}
                  disabled={loading}
                  className="w-full px-3 py-2 bg-[#25d366] text-white rounded hover:opacity-90 disabled:opacity-50"
                >
                  {loading ? 'Sending...' : 'Send Request'}
                </button>
                {error && <p className="text-red-600 text-sm">{error}</p>}
              </div>
            )}
          </div>

          {/* Pending Requests */}
          {pendingRequests.length > 0 && (
              <div className="p-3">
                <h3 className="text-sm font-semibold text-gray-600 mb-2">Pending Requests</h3>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                {pendingRequests.map((req) => (
                  <div key={req.id} className="p-2 bg-gray-100 rounded">
                    <div className="flex items-center justify-between">
                      <p className="font-medium">{req.username}</p>
                      <div className="flex gap-2">
                        <button onClick={() => handleAcceptRequest(req.id)} className="text-xs bg-[#25d366] text-white px-2 py-1 rounded">Accept</button>
                        <button onClick={() => handleRejectRequest(req.id)} className="text-xs bg-red-500 text-white px-2 py-1 rounded">Reject</button>
                      </div>
                    </div>
                  </div>
                ))}
                </div>
              </div>
          )}

          {/* Friends List */}
          <div className="flex-1 overflow-y-auto">
            {filteredFriends.length === 0 ? (
              <p className="text-sm text-gray-500 px-3">No friends found. Add a friend to start chatting.</p>
            ) : (
              filteredFriends.map((friend) => (
                <div
                  key={friend.friend_id}
                  onClick={() => setSelectedContact(friend)}
                  className={`px-4 py-3 cursor-pointer hover:bg-gray-50 border-b ${selectedContact?.friend_id === friend.friend_id ? 'bg-gray-100' : ''}`}
                >
                  <div className="font-medium">{friend.username}</div>
                  <div className="text-xs text-gray-500">Tap to chat</div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Chat Area */}
        <div className="bg-[#efeae2] flex flex-col">
          {selectedContact ? (
            <>
              {/* Chat header */}
              <div className="px-4 py-3 bg-[#f0f2f5] border-b">
                <h2 className="font-semibold">{selectedContact.username}</h2>
                <p className="text-xs text-gray-500 mt-1">
                  🔒 End-to-end encrypted • Messages are not stored
                </p>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.length === 0 ? (
                  <div className="text-center mt-8">
                    <p className="text-gray-500 mb-2">No messages yet. Start the conversation!</p>
                    <p className="text-xs text-gray-400">
                      All messages are end-to-end encrypted and delivered in real-time only
                    </p>
                  </div>
                ) : (
                  messages.map((msg, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`p-2 rounded-lg max-w-[70%] relative ${
                        msg.senderId === user?.id
                          ? 'ml-auto bg-[#d9fdd3]'
                          : 'bg-white'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <div className="flex-1">
                          {msg.message || msg.encryptedMessage}
                        </div>
                        {!msg.isFile && (
                          <span className="text-green-600 text-xs" title="End-to-end encrypted with Post-Quantum Cryptography">
                            🔒
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] opacity-60 mt-1 text-right">
                        {new Date(msg.timestamp).toLocaleTimeString()}
                        {!msg.isFile && (
                          <span className="ml-1 text-green-600">E2EE</span>
                        )}
                      </p>
                    </motion.div>
                  ))
                )}
              </div>
              
              {/* File transfer status */}
              {fileTransferStatus && (
                <div className="px-4 py-2 bg-blue-100 text-blue-800 text-sm">
                  {fileTransferStatus}
                </div>
              )}

              {/* Pending files list - requires user consent before download */}
              {pendingFiles.length > 0 && (
                <div className="px-4 py-3 bg-amber-50 border-t border-amber-200">
                  <div className="text-sm font-semibold text-amber-900 mb-2">
                    📂 Pending Files ({pendingFiles.length})
                  </div>
                  <div className="space-y-2">
                    {pendingFiles.map((file) => (
                      <motion.div
                        key={file.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-center justify-between bg-white p-2 rounded border border-amber-200"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            📎 {file.fileName}
                          </p>
                          <p className="text-xs text-gray-600">
                            From {file.senderName} • {(file.fileSize / 1024).toFixed(2)} KB
                          </p>
                        </div>
                        <div className="flex gap-2 ml-2">
                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => handleDownloadFile(file.id)}
                            className="px-3 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700 whitespace-nowrap"
                            title={`Download ${file.fileName}`}
                          >
                            ✓ Accept
                          </motion.button>
                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => handleDeclineFile(file.id)}
                            className="px-3 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700 whitespace-nowrap"
                            title={`Decline ${file.fileName}`}
                          >
                            ✕ Decline
                          </motion.button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Selected file preview */}
              {selectedFile && (
                <div className="px-4 py-2 bg-yellow-100 flex items-center justify-between">
                  <span className="text-sm">📎 {selectedFile.name} ({(selectedFile.size / 1024).toFixed(2)} KB)</span>
                  <div className="flex gap-2">
                    <button
                      onClick={handleSendFile}
                      className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                    >
                      Send File
                    </button>
                    <button
                      onClick={() => {
                        setSelectedFile(null);
                        const fileInput = document.getElementById('file-input');
                        if (fileInput) fileInput.value = '';
                      }}
                      className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              
              <div className="p-3 bg-[#f0f2f5] flex gap-2">
                <input
                  type="file"
                  id="file-input"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <label
                  htmlFor="file-input"
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-full cursor-pointer hover:bg-gray-300 flex items-center justify-center"
                  title="Attach file (Max 10MB)"
                >
                  📎
                </label>
                <input
                  type="text"
                  placeholder="Type a message..."
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                  className="flex-1 px-4 py-2 rounded-full bg-white text-gray-900 placeholder-gray-500 focus:outline-none"
                />
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleSendMessage}
                  className="px-6 py-2 bg-[#00a884] text-white font-medium rounded-full hover:opacity-90"
                >
                  Send
                </motion.button>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-center">
              <div>
                <p className="text-xl text-gray-500 mb-2">Welcome to QuantumShield</p>
                <p className="text-sm text-gray-400">Select a friend or add a new one to start chatting</p>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default ChatDashboard;

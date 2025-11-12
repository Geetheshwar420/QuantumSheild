import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const API_URL = 'http://localhost:3001/api';

const ChatDashboard = ({ user, socket }) => {
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
  const navigate = useNavigate();
  const token = localStorage.getItem('token');

  const fetchFriends = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/friends/list`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setFriends(response.data.friends || []);
    } catch (err) {
      console.error('Failed to fetch friends:', err);
    }
  }, [token]);

  const fetchPendingRequests = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/friends/requests/pending`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPendingRequests(response.data.pending_requests || []);
    } catch (err) {
      console.error('Failed to fetch pending requests:', err);
    }
  }, [token]);

  useEffect(() => {
    if (!user) {
      navigate('/login');
    }

    // Fetch friends list and pending requests
    fetchFriends();
    fetchPendingRequests();

    // Listen for incoming messages
    socket.on('receiveMessage', (data) => {
      setMessages((prev) => [...prev, data]);
    });

    // Listen for friend request notifications
    socket.on('friendRequestReceived', (data) => {
      fetchPendingRequests(); // Refresh pending requests
    });

    socket.on('messageError', (data) => {
      setError(data.error);
    });

    return () => {
      socket.off('receiveMessage');
      socket.off('friendRequestReceived');
      socket.off('messageError');
    };
  }, [user, socket, navigate, fetchFriends, fetchPendingRequests]);

  // moved into useCallback above

  const handleSendFriendRequest = async () => {
    if (!searchUsername) return;

    setLoading(true);
    setError('');

    try {
      await axios.post(
        `${API_URL}/friends/request`,
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
        `${API_URL}/friends/request/${requestId}/accept`,
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
        `${API_URL}/friends/request/${requestId}/reject`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      fetchPendingRequests();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to reject request');
    }
  };

  const handleSendMessage = () => {
    if (!messageText || !selectedContact) return;

    socket.emit('sendMessage', {
      senderId: user?.id,
      receiverId: selectedContact.friend_id,
      encryptedMessage: messageText,
      clientSignature: 'simulated_signature',
    });

    setMessages((prev) => [
      ...prev,
      {
        senderId: user?.id,
        encryptedMessage: messageText,
        timestamp: new Date().toISOString(),
      },
    ]);

    setMessageText('');
  };

  const filteredFriends = useMemo(() => {
    if (!friendSearch) return friends;
    return friends.filter(f => f.username.toLowerCase().includes(friendSearch.toLowerCase()));
  }, [friends, friendSearch]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Top bar */}
      <div className="w-full bg-[#00a884] text-white">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="font-semibold">QuantumShield</div>
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
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.length === 0 ? (
                  <p className="text-center text-gray-500 mt-8">No messages yet. Start the conversation!</p>
                ) : (
                  messages.map((msg, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`p-2 rounded-lg max-w-[70%] ${
                        msg.senderId === user?.id
                          ? 'ml-auto bg-[#d9fdd3]'
                          : 'bg-white'
                      }`}
                    >
                      {msg.encryptedMessage}
                      <p className="text-[10px] opacity-60 mt-1 text-right">
                        {new Date(msg.timestamp).toLocaleTimeString()}
                      </p>
                    </motion.div>
                  ))
                )}
              </div>
              <div className="p-3 bg-[#f0f2f5] flex gap-2">
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

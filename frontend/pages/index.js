import { useState, useEffect } from 'react';
import io from 'socket.io-client';

const socket = io('http://localhost:3001');

export default function Home() {
  const [username, setUsername] = useState('');
  const [loggedIn, setLoggedIn] = useState(false);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [recipient, setRecipient] = useState('');
  const [kyberSecret, setKyberSecret] = useState(null);
  const [falconSecret, setFalconSecret] = useState(null);

  useEffect(() => {
    socket.on('receiveMessage', (data) => {
      setMessages(prev => [...prev, { sender: data.sender, text: data.encryptedMessage }]);
    });

    socket.on('error', (error) => {
      alert(`Error: ${error}`);
    });

    return () => {
      socket.off('receiveMessage');
      socket.off('error');
    };
  }, []);

  const handleRegister = () => {
    if (username) {
      socket.emit('register', username);
      socket.on('registered', (keys) => {
        setKyberSecret(keys.kyberSecret);
        setFalconSecret(keys.falconSecret);
        setLoggedIn(true);
      });
    }
  };

  const sendMessage = async () => {
    if (!message || !recipient || !falconSecret) return;
    
    // In a real implementation, we would encrypt the message with Kyber here
    // For simplicity, we're just sending the plaintext as encryptedMessage
    const encryptedMessage = message;
    
    // Sign the message with Falcon
    // This requires actual Falcon implementation which we'll simulate
    const signature = 'SIGNATURE_SIMULATED';
    
    socket.emit('sendMessage', {
      sender: username,
      recipient,
      encryptedMessage,
      signature
    });
    
    setMessages(prev => [...prev, { sender: 'You', text: message }]);
    setMessage('');
  };

  if (!loggedIn) {
    return (
      <div>
        <h1>QuantumShield</h1>
        <input
          type="text"
          placeholder="Enter username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <button onClick={handleRegister}>Register</button>
      </div>
    );
  }

  return (
    <div>
      <h1>Welcome, {username}</h1>
      <div>
        <input
          type="text"
          placeholder="Recipient username"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
        />
        <input
          type="text"
          placeholder="Type a message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        <button onClick={sendMessage}>Send</button>
      </div>
      <div>
        <h2>Messages</h2>
        {messages.map((msg, index) => (
          <p key={index}><strong>{msg.sender}:</strong> {msg.text}</p>
        ))}
      </div>
    </div>
  );
}

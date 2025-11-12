const express = require('express');
const db = require('../database/db');
const { verifyToken } = require('../middleware/authMiddleware');

const router = express.Router();

// Send a friend request
router.post('/request', verifyToken, (req, res) => {
  const { receiver_username } = req.body;
  const sender_id = req.user.id;

  if (!receiver_username) {
    return res.status(400).json({ error: 'Receiver username is required' });
  }

  // Get receiver ID
  const getReceiverStmt = db.prepare('SELECT id FROM users WHERE username = ?');
  getReceiverStmt.get(receiver_username, (err, receiver) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    if (!receiver) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (receiver.id === sender_id) {
      return res.status(400).json({ error: 'Cannot send friend request to yourself' });
    }

    // Check if friendship already exists
    const checkFriendshipStmt = db.prepare(
      'SELECT id FROM friendships WHERE (user_id_1 = ? AND user_id_2 = ?) OR (user_id_1 = ? AND user_id_2 = ?)'
    );
    checkFriendshipStmt.get(sender_id, receiver.id, receiver.id, sender_id, (err, friendship) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      if (friendship) {
        return res.status(400).json({ error: 'You are already friends with this user' });
      }

      // Check if request already exists
      const checkRequestStmt = db.prepare(
        'SELECT id, status FROM friend_requests WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)'
      );
      checkRequestStmt.get(sender_id, receiver.id, receiver.id, sender_id, (err, existingRequest) => {
        if (err) {
          return res.status(500).json({ error: 'Database error' });
        }

        if (existingRequest) {
          if (existingRequest.status === 'pending') {
            return res.status(400).json({ error: 'Friend request already pending' });
          } else if (existingRequest.status === 'accepted') {
            return res.status(400).json({ error: 'You are already friends' });
          }
        }

        // Create friend request
        const createRequestStmt = db.prepare(
          'INSERT INTO friend_requests (sender_id, receiver_id, status) VALUES (?, ?, ?)'
        );
        createRequestStmt.run(sender_id, receiver.id, 'pending', (err) => {
          if (err) {
            return res.status(500).json({ error: 'Failed to send friend request' });
          }

          res.status(201).json({
            message: 'Friend request sent successfully',
            receiver_id: receiver.id,
            receiver_username: receiver_username
          });
        });
      });
    });
  });
});

// Get pending friend requests for current user
router.get('/requests/pending', verifyToken, (req, res) => {
  const user_id = req.user.id;

  const stmt = db.prepare(
    `SELECT fr.id, fr.sender_id, fr.created_at, u.username 
     FROM friend_requests fr 
     JOIN users u ON fr.sender_id = u.id 
     WHERE fr.receiver_id = ? AND fr.status = 'pending' 
     ORDER BY fr.created_at DESC`
  );

  stmt.all(user_id, (err, requests) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    res.json({
      pending_requests: requests || []
    });
  });
});

// Accept a friend request
router.post('/request/:request_id/accept', verifyToken, (req, res) => {
  const { request_id } = req.params;
  const user_id = req.user.id;

  // Get the friend request
  const getRequestStmt = db.prepare('SELECT * FROM friend_requests WHERE id = ? AND receiver_id = ?');
  getRequestStmt.get(request_id, user_id, (err, friendRequest) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    if (!friendRequest) {
      return res.status(404).json({ error: 'Friend request not found' });
    }

    if (friendRequest.status !== 'pending') {
      return res.status(400).json({ error: 'Friend request is no longer pending' });
    }

    // Start transaction-like operations
    // Create friendship (ensure consistent ordering)
    const user_id_1 = Math.min(friendRequest.sender_id, user_id);
    const user_id_2 = Math.max(friendRequest.sender_id, user_id);

    const createFriendshipStmt = db.prepare(
      'INSERT INTO friendships (user_id_1, user_id_2) VALUES (?, ?)'
    );

    createFriendshipStmt.run(user_id_1, user_id_2, (err) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to create friendship' });
      }

      // Update friend request status
      const updateRequestStmt = db.prepare(
        'UPDATE friend_requests SET status = ?, responded_at = CURRENT_TIMESTAMP WHERE id = ?'
      );
      updateRequestStmt.run('accepted', request_id, (err) => {
        if (err) {
          return res.status(500).json({ error: 'Failed to accept friend request' });
        }

        res.json({
          message: 'Friend request accepted',
          friend_id: friendRequest.sender_id
        });
      });
    });
  });
});

// Reject a friend request
router.post('/request/:request_id/reject', verifyToken, (req, res) => {
  const { request_id } = req.params;
  const user_id = req.user.id;

  const getRequestStmt = db.prepare('SELECT * FROM friend_requests WHERE id = ? AND receiver_id = ?');
  getRequestStmt.get(request_id, user_id, (err, friendRequest) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    if (!friendRequest) {
      return res.status(404).json({ error: 'Friend request not found' });
    }

    if (friendRequest.status !== 'pending') {
      return res.status(400).json({ error: 'Friend request is no longer pending' });
    }

    const updateStmt = db.prepare(
      'UPDATE friend_requests SET status = ?, responded_at = CURRENT_TIMESTAMP WHERE id = ?'
    );
    updateStmt.run('rejected', request_id, (err) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to reject friend request' });
      }

      res.json({ message: 'Friend request rejected' });
    });
  });
});

// Get list of friends for current user
router.get('/list', verifyToken, (req, res) => {
  const user_id = req.user.id;

  const stmt = db.prepare(
    `SELECT CASE 
       WHEN f.user_id_1 = ? THEN f.user_id_2 
       ELSE f.user_id_1 
     END as friend_id,
     u.username,
     f.created_at
     FROM friendships f
     JOIN users u ON (
       CASE WHEN f.user_id_1 = ? THEN f.user_id_2 ELSE f.user_id_1 END = u.id
     )
     WHERE f.user_id_1 = ? OR f.user_id_2 = ?
     ORDER BY f.created_at DESC`
  );

  stmt.all(user_id, user_id, user_id, user_id, (err, friends) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    res.json({
      friends: friends || []
    });
  });
});

// Remove a friend
router.delete('/:friend_id', verifyToken, (req, res) => {
  const { friend_id } = req.params;
  const user_id = req.user.id;

  const user_id_1 = Math.min(user_id, parseInt(friend_id));
  const user_id_2 = Math.max(user_id, parseInt(friend_id));

  const deleteStmt = db.prepare('DELETE FROM friendships WHERE user_id_1 = ? AND user_id_2 = ?');
  deleteStmt.run(user_id_1, user_id_2, (err) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to remove friend' });
    }

    res.json({ message: 'Friend removed successfully' });
  });
});

// Check if user is friend with another user
router.get('/check/:friend_id', verifyToken, (req, res) => {
  const { friend_id } = req.params;
  const user_id = req.user.id;

  const user_id_1 = Math.min(user_id, parseInt(friend_id));
  const user_id_2 = Math.max(user_id, parseInt(friend_id));

  const stmt = db.prepare('SELECT id FROM friendships WHERE user_id_1 = ? AND user_id_2 = ?');
  stmt.get(user_id_1, user_id_2, (err, friendship) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    res.json({
      is_friend: !!friendship
    });
  });
});

module.exports = router;

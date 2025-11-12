const express = require('express');
const router = express.Router();

// @route   GET api/messages
// @desc    Get all messages
// @access  Private
router.get('/', (req, res) => {
  res.send('Get all messages');
});

// @route   POST api/messages
// @desc    Send a message
// @access  Private
router.post('/', (req, res) => {
  res.send('Send a message');
});

module.exports = router;

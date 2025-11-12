# QuantumShield Friend Request System Documentation

## Overview

The friend request system is a critical feature in QuantumShield that ensures secure communication only occurs between users who have explicitly accepted each other as friends. This implements a social networking model where users must:

1. **Register** - Create account with CRYSTALS-Kyber and Falcon key pairs
2. **Login** - Authenticate with challenge-response using Falcon signatures
3. **Send Friend Request** - Request connection with another user
4. **Accept/Reject Request** - Manage incoming friend requests
5. **Chat & Share Files** - Only with accepted friends

## Database Schema

### Tables

#### `friend_requests` Table
Stores pending friend request status and history.

```sql
CREATE TABLE friend_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_id INTEGER NOT NULL,
  receiver_id INTEGER NOT NULL,
  status TEXT DEFAULT 'pending',  -- 'pending', 'accepted', 'rejected'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  responded_at DATETIME,
  FOREIGN KEY (sender_id) REFERENCES users (id),
  FOREIGN KEY (receiver_id) REFERENCES users (id),
  UNIQUE(sender_id, receiver_id)
);

-- Index for fast lookup of pending requests
CREATE INDEX idx_friend_requests_receiver ON friend_requests(receiver_id);
CREATE INDEX idx_friend_requests_sender ON friend_requests(sender_id);
```

#### `friendships` Table
Stores confirmed bidirectional friendships.

```sql
CREATE TABLE friendships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id_1 INTEGER NOT NULL,
  user_id_2 INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id_1) REFERENCES users (id),
  FOREIGN KEY (user_id_2) REFERENCES users (id),
  UNIQUE(user_id_1, user_id_2)
);

-- Indexes for bidirectional lookup
CREATE INDEX idx_friendships_user1 ON friendships(user_id_1);
CREATE INDEX idx_friendships_user2 ON friendships(user_id_2);
```

**Key Design Decisions:**
- **Bidirectional Representation**: `friendships` table stores the lower user ID as `user_id_1` and higher ID as `user_id_2` to prevent duplicate entries
- **UNIQUE Constraint**: Prevents duplicate friend requests between same users
- **Status Tracking**: `friend_requests.status` tracks lifecycle (pending → accepted/rejected)
- **Timestamps**: Enable audit trails and sorting by request age

## API Endpoints

### 1. Send Friend Request
**POST** `/api/friends/request`

**Authentication**: Required (Bearer Token)

**Request Body:**
```json
{
  "receiver_username": "string"
}
```

**Response (Success - 201):**
```json
{
  "message": "Friend request sent successfully",
  "receiver_id": 123,
  "receiver_username": "targetuser"
}
```

**Error Cases:**
- `400` - Receiver username not provided
- `404` - User not found
- `400` - Cannot send request to yourself
- `400` - Already friends with this user
- `400` - Friend request already pending

**Implementation Details:**
- Validates receiver exists
- Checks existing friendship relationship
- Prevents self-requests
- Uses UNIQUE constraint to prevent duplicates

---

### 2. Get Pending Friend Requests
**GET** `/api/friends/requests/pending`

**Authentication**: Required (Bearer Token)

**Response (200):**
```json
{
  "pending_requests": [
    {
      "id": 5,
      "sender_id": 10,
      "username": "alice",
      "created_at": "2024-01-15T10:30:00Z"
    },
    {
      "id": 6,
      "sender_id": 11,
      "username": "bob",
      "created_at": "2024-01-14T15:45:00Z"
    }
  ]
}
```

**Returns**: All pending requests where current user is receiver, sorted by creation date (newest first)

---

### 3. Accept Friend Request
**POST** `/api/friends/request/:request_id/accept`

**Authentication**: Required (Bearer Token)

**Path Parameters:**
- `request_id` - ID of the friend request to accept

**Response (200):**
```json
{
  "message": "Friend request accepted",
  "friend_id": 10
}
```

**Process:**
1. Verifies request exists and is pending
2. Creates bidirectional friendship entry (lower ID as user_id_1)
3. Updates request status to 'accepted'
4. Records response timestamp

**Error Cases:**
- `404` - Friend request not found
- `400` - Request is no longer pending

---

### 4. Reject Friend Request
**POST** `/api/friends/request/:request_id/reject`

**Authentication**: Required (Bearer Token)

**Response (200):**
```json
{
  "message": "Friend request rejected"
}
```

**Process:**
1. Verifies request exists and is pending
2. Updates status to 'rejected'
3. Records response timestamp
4. Does NOT create friendship entry

---

### 5. Get Friends List
**GET** `/api/friends/list`

**Authentication**: Required (Bearer Token)

**Response (200):**
```json
{
  "friends": [
    {
      "friend_id": 10,
      "username": "alice",
      "created_at": "2024-01-10T08:00:00Z"
    },
    {
      "friend_id": 11,
      "username": "bob",
      "created_at": "2024-01-08T12:30:00Z"
    }
  ]
}
```

**Query Logic:**
- Retrieves all users in friendships table where current user is either user_id_1 or user_id_2
- Returns the OTHER user in the relationship
- Sorted by friendship creation date (oldest first)

---

### 6. Check Friendship Status
**GET** `/api/friends/check/:friend_id`

**Authentication**: Required (Bearer Token)

**Response (200):**
```json
{
  "is_friend": true
}
```

**Purpose**: Quick validation before allowing message/file operations

---

### 7. Remove Friend
**DELETE** `/api/friends/:friend_id`

**Authentication**: Required (Bearer Token)

**Response (200):**
```json
{
  "message": "Friend removed successfully"
}
```

**Process:**
1. Deletes friendship entry (regardless of which ID is user_id_1/user_id_2)
2. Does NOT delete any messages or files shared
3. User can send new friend request if needed

## Access Control

### Messaging Access Control
Enforced in Socket.IO event handler:

```javascript
socket.on('sendMessage', ({ senderId, receiverId, encryptedMessage }) => {
  // Calculate consistent user_id ordering
  const user_id_1 = Math.min(senderId, receiverId);
  const user_id_2 = Math.max(senderId, receiverId);
  
  // Check if friendship exists
  const checkFriendStmt = db.prepare(
    'SELECT id FROM friendships WHERE user_id_1 = ? AND user_id_2 = ?'
  );
  checkFriendStmt.get(user_id_1, user_id_2, (err, friendship) => {
    if (!friendship) {
      return socket.emit('messageError', { error: 'You can only message friends' });
    }
    // Proceed with message storage and broadcast
  });
});
```

**Key Points:**
- Every message send attempt validates friendship
- Socket error response prevents message storage
- No exception for group chats (currently 1:1 only)

### File Sharing Access Control
Similar validation needed in `POST /api/files/upload`:

```javascript
router.post('/upload', verifyToken, async (req, res) => {
  const { receiver_id } = req.body;
  const sender_id = req.user.id;
  
  // Verify friendship before allowing upload
  const user_id_1 = Math.min(sender_id, receiver_id);
  const user_id_2 = Math.max(sender_id, receiver_id);
  
  const friendship = await db.get(
    'SELECT id FROM friendships WHERE user_id_1 = ? AND user_id_2 = ?',
    [user_id_1, user_id_2]
  );
  
  if (!friendship) {
    return res.status(403).json({ error: 'Can only share files with friends' });
  }
  // Proceed with file upload
});
```

## Frontend Integration

### React ChatDashboard Component

**Key Features:**
1. **Add Friend Button** - Opens username search input
2. **Friends List** - Shows all confirmed friends
3. **Pending Requests** - Shows incoming requests with Accept/Reject buttons
4. **Message Recipient** - Dropdown restricted to confirmed friends only

**Component State:**
```javascript
const [friends, setFriends] = useState([]);
const [pendingRequests, setPendingRequests] = useState([]);
const [selectedContact, setSelectedContact] = useState(null);
```

**Key Functions:**
```javascript
// Fetch friends and pending requests on mount
useEffect(() => {
  fetchFriends();
  fetchPendingRequests();
}, []);

// Send friend request
const handleSendFriendRequest = async () => {
  const response = await axios.post(
    `${API_URL}/friends/request`,
    { receiver_username: searchUsername },
    { headers: { Authorization: `Bearer ${token}` } }
  );
};

// Accept/reject requests
const handleAcceptRequest = async (requestId) => {
  await axios.post(
    `${API_URL}/friends/request/${requestId}/accept`,
    {},
    { headers: { Authorization: `Bearer ${token}` } }
  );
  fetchPendingRequests();
  fetchFriends();
};
```

**UI Layout (4-Column Grid):**
1. **Left Sidebar** (1 column):
   - Add Friend button + search
   - Pending Requests section
   - Friends List
2. **Chat Area** (3 columns):
   - Message display
   - Message input
   - Only shows when friend selected

## Mobile Integration

### Flutter FriendsScreen

**Features:**
- Add friend by username search
- List pending requests with Accept/Reject
- View confirmed friends list
- Remove friend functionality
- Real-time error messages and toasts

**Implementation:**
```dart
class FriendsScreen extends StatefulWidget {
  final String token;
  final String userId;
}

// Uses Dio HTTP client for API calls
// Manages loading states and error handling
// Real-time UI updates via setState
```

**Navigation Integration:**
Should be added to main navigation drawer or bottom tab bar:
```dart
// In main.dart
BottomNavigationBar(
  items: [
    BottomNavigationBarItem(icon: Icon(Icons.chat), label: 'Chat'),
    BottomNavigationBarItem(icon: Icon(Icons.people), label: 'Friends'),
    BottomNavigationBarItem(icon: Icon(Icons.account), label: 'Profile'),
  ],
)
```

## Security Considerations

1. **Mutual Consent**: Both users must explicitly accept friendship
2. **Token Validation**: All endpoints require JWT authentication
3. **User Validation**: Cannot send request to non-existent users
4. **Prevention of Duplicate States**: UNIQUE constraints prevent duplicate requests/friendships
5. **Bidirectional Consistency**: Friendship table stores in canonical form (min_id, max_id)

## User Flow Diagram

```
┌─────────────────┐
│   New User      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Register       │ (Create Kyber/Falcon keys)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Login         │ (Challenge-response auth)
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  Search for users to befriend       │
│  Enter username + click "Add Friend"│
└────────┬────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────┐
│  Friend Request Sent (pending status)   │
│  Receiver sees in "Pending Requests"    │
└────────┬─────────────────────────────────┘
         │
         ▼
    ┌────┴────┐
    │          │
    ▼          ▼
┌─────────┐┌──────────┐
│ ACCEPT  ││  REJECT  │
└────┬────┘└──────────┘
     │
     ▼
┌──────────────────────────────────┐
│  Friendship Created              │
│  Both can now:                   │
│  - Send/receive messages         │
│  - Share files                   │
│  - See each other in friends list│
└──────────────────────────────────┘
```

## Testing Checklist

- [ ] Send friend request to existing user
- [ ] Try to send duplicate request (should fail)
- [ ] Send request to non-existent user (should fail)
- [ ] Send request to yourself (should fail)
- [ ] Accept pending request
- [ ] Reject pending request
- [ ] View friends list after accepting
- [ ] Send message only to friend (non-friend should error)
- [ ] Upload file only to friend (non-friend should error)
- [ ] Remove friend and verify cannot message
- [ ] Resend friend request after rejection

## Future Enhancements

1. **Block/Unblock Users**: Prevent unwanted requests
2. **Friend Groups**: Organize friends into categories
3. **Request Notifications**: Real-time notifications via Socket.IO
4. **Auto-Accept**: Optional setting to auto-accept from certain users
5. **Friend Recommendations**: Suggest friends based on mutual connections
6. **Friend Requests Pagination**: Handle large numbers of pending requests
7. **Last Seen Status**: Show when friend was last online
8. **Request Expiration**: Auto-expire old pending requests (>30 days)

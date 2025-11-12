import 'package:flutter/material.dart';
import 'package:dio/dio.dart';

class FriendsScreen extends StatefulWidget {
  final String token;
  final String userId;

  const FriendsScreen({
    Key? key,
    required this.token,
    required this.userId,
  }) : super(key: key);

  @override
  State<FriendsScreen> createState() => _FriendsScreenState();
}

class _FriendsScreenState extends State<FriendsScreen> {
  late Dio dio;
  final String apiUrl = 'http://localhost:3001/api';

  List<Map<String, dynamic>> friends = [];
  List<Map<String, dynamic>> pendingRequests = [];
  final TextEditingController searchController = TextEditingController();
  bool isLoading = false;
  String? errorMessage;

  @override
  void initState() {
    super.initState();
    dio = Dio(BaseOptions(
      baseUrl: apiUrl,
      headers: {'Authorization': 'Bearer ${widget.token}'},
    ));
    _loadData();
  }

  Future<void> _loadData() async {
    await _fetchFriends();
    await _fetchPendingRequests();
  }

  Future<void> _fetchFriends() async {
    try {
      setState(() {
        isLoading = true;
        errorMessage = null;
      });

      final response = await dio.get('/friends/list');
      setState(() {
        friends = List<Map<String, dynamic>>.from(response.data['friends'] ?? []);
        isLoading = false;
      });
    } catch (e) {
      setState(() {
        errorMessage = 'Failed to load friends: $e';
        isLoading = false;
      });
    }
  }

  Future<void> _fetchPendingRequests() async {
    try {
      final response = await dio.get('/friends/requests/pending');
      setState(() {
        pendingRequests = List<Map<String, dynamic>>.from(
          response.data['pending_requests'] ?? [],
        );
      });
    } catch (e) {
      print('Failed to load pending requests: $e');
    }
  }

  Future<void> _sendFriendRequest() async {
    if (searchController.text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter a username')),
      );
      return;
    }

    try {
      setState(() {
        isLoading = true;
        errorMessage = null;
      });

      await dio.post(
        '/friends/request',
        data: {'receiver_username': searchController.text},
      );

      setState(() {
        searchController.clear();
        isLoading = false;
      });

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Friend request sent successfully!')),
      );
    } catch (e) {
      setState(() {
        errorMessage = 'Failed to send request: ${e.toString()}';
        isLoading = false;
      });
    }
  }

  Future<void> _acceptRequest(int requestId) async {
    try {
      await dio.post('/friends/request/$requestId/accept');
      await _fetchPendingRequests();
      await _fetchFriends();

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Friend request accepted!')),
      );
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to accept request: $e')),
      );
    }
  }

  Future<void> _rejectRequest(int requestId) async {
    try {
      await dio.post('/friends/request/$requestId/reject');
      await _fetchPendingRequests();

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Friend request rejected')),
      );
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to reject request: $e')),
      );
    }
  }

  Future<void> _removeFriend(int friendId) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Remove Friend'),
        content: const Text('Are you sure you want to remove this friend?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Remove'),
          ),
        ],
      ),
    );

    if (confirmed ?? false) {
      try {
        await dio.delete('/friends/$friendId');
        await _fetchFriends();

        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Friend removed')),
        );
      } catch (e) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to remove friend: $e')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Friends'),
        backgroundColor: Colors.deepPurple,
      ),
      body: isLoading
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              padding: const EdgeInsets.all(16.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Error Message
                  if (errorMessage != null)
                    Container(
                      padding: const EdgeInsets.all(12.0),
                      margin: const EdgeInsets.only(bottom: 16.0),
                      decoration: BoxDecoration(
                        color: Colors.red.shade100,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        errorMessage!,
                        style: TextStyle(color: Colors.red.shade900),
                      ),
                    ),

                  // Add Friend Section
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16.0),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Add Friend',
                            style: TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          const SizedBox(height: 12),
                          TextField(
                            controller: searchController,
                            decoration: InputDecoration(
                              hintText: 'Enter username',
                              prefixIcon: const Icon(Icons.person),
                              border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(8),
                              ),
                            ),
                          ),
                          const SizedBox(height: 12),
                          SizedBox(
                            width: double.infinity,
                            child: ElevatedButton(
                              onPressed: isLoading ? null : _sendFriendRequest,
                              style: ElevatedButton.styleFrom(
                                backgroundColor: Colors.deepPurple,
                              ),
                              child: const Text('Send Request'),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 20),

                  // Pending Requests
                  if (pendingRequests.isNotEmpty)
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Pending Requests (${pendingRequests.length})',
                          style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: 12),
                        ...pendingRequests.map((request) {
                          return Card(
                            margin: const EdgeInsets.only(bottom: 8.0),
                            child: Padding(
                              padding: const EdgeInsets.all(12.0),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    request['username'] ?? 'Unknown',
                                    style: const TextStyle(
                                      fontWeight: FontWeight.bold,
                                      fontSize: 16,
                                    ),
                                  ),
                                  const SizedBox(height: 8),
                                  Row(
                                    mainAxisAlignment:
                                        MainAxisAlignment.spaceEvenly,
                                    children: [
                                      Expanded(
                                        child: ElevatedButton(
                                          onPressed: () =>
                                              _acceptRequest(request['id']),
                                          style: ElevatedButton.styleFrom(
                                            backgroundColor: Colors.green,
                                          ),
                                          child: const Text('Accept'),
                                        ),
                                      ),
                                      const SizedBox(width: 8),
                                      Expanded(
                                        child: ElevatedButton(
                                          onPressed: () =>
                                              _rejectRequest(request['id']),
                                          style: ElevatedButton.styleFrom(
                                            backgroundColor: Colors.red,
                                          ),
                                          child: const Text('Reject'),
                                        ),
                                      ),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                          );
                        }).toList(),
                        const SizedBox(height: 20),
                      ],
                    ),

                  // Friends List
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Friends (${friends.length})',
                        style: const TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 12),
                      friends.isEmpty
                          ? Card(
                              child: Padding(
                                padding: const EdgeInsets.all(24.0),
                                child: Center(
                                  child: Column(
                                    children: const [
                                      Icon(Icons.people_outline, size: 48),
                                      SizedBox(height: 12),
                                      Text(
                                        'No friends yet',
                                        style: TextStyle(fontSize: 16),
                                      ),
                                      SizedBox(height: 8),
                                      Text(
                                        'Send a friend request to get started!',
                                        style: TextStyle(
                                          fontSize: 14,
                                          color: Colors.grey,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            )
                          : Column(
                              children: friends.map((friend) {
                                return Card(
                                  margin: const EdgeInsets.only(bottom: 8.0),
                                  child: ListTile(
                                    leading: const Icon(Icons.person),
                                    title: Text(friend['username'] ?? 'Unknown'),
                                    trailing: IconButton(
                                      icon: const Icon(Icons.close),
                                      onPressed: () =>
                                          _removeFriend(friend['friend_id']),
                                    ),
                                  ),
                                );
                              }).toList(),
                            ),
                    ],
                  ),
                ],
              ),
            ),
    );
  }

  @override
  void dispose() {
    searchController.dispose();
    super.dispose();
  }
}

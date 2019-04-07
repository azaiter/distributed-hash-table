# Simple Distributed Hash Table

Author: Abdulrahman (Zack) Zaiter

This program is a proof of concept of simple cloud-native distributed hash table implementation, each peer is a docker container within a contained docker-compose network.

## Requirements:
- Docker and Docker-Compose
- That's it.

## To Run:
- `docker-compose down; docker-compose build; docker-compose up`
- That's it

# Current design vs. Other designs:

### There are 5 points that are worth to be discussed:
#### 1- Nodes/Peers initialization process:
The book [_Computer Networking: A Top-Down Approach by Kurose, sixth edition_](https://www.amazon.com/Computer-Networking-Top-Down-Approach-6th/dp/0132856204) does not mention any algorithm or means for the nodes/peers to connect and be aware of each other without using broadcast address, In this application, the initialization and configuration of the peers has to be done in the `INIT_CONFIG` environment variable to know current/previous/subsequent1/subsequent2 peers/nodes.

#### 2- Consensus of peers/states:
The algorithm does not guarantee a stable and highly available state of the peers as it does not have any mechanism to do so, it distributes the work based on the key to available nodes in the peers chain. One advantage that the current application have over the book's algorithm is that every node/peer is capable of serving the set and get commands.

#### 3- Data:
The data in a specific peer gets lost if the peer decides to leave, the data is distributed and not replicated.

#### 4- Re-arrangement of keys:
If a node decides to join/leave, the data the exists inside the already existing nodes/peers will stay as is and a re-arrangement is needed for optimal keys distribution, this is not accounted for in this application or the algorithm in the book.

#### 5- Collision of hashes
The algorithm in the book does not mention how to handle collision on hash handling and assumes that the keys are collision free despite that the algorithm used for hashing is extremely prone to collisions. The way I handled the collisions in this application is that for each hash key, I created an internal hash table that takes the original string key and an array of values, therefore, the searching algorithm will look if the hash exists, if so, it looks for the internal key, if it exists, it returns the array of values it has saved.


## Sample output (comments on execution starts with #):
```
# Initialization
dht16_1  | Node dht16 on index 16 listening on port 15000!
dht12_1  | Node dht12 on index 12 listening on port 15000!
dht4_1   | Node dht4 on index 4 listening on port 15000!
dht1_1   | Node dht1 on index 1 listening on port 15000!
dht8_1   | Node dht8 on index 8 listening on port 15000!
dht16_1  | Started the heartbeating process.
dht12_1  | Started the heartbeating process.
dht4_1   | Started the heartbeating process.
dht1_1   | Started the heartbeating process.
dht8_1   | Started the heartbeating process.

# Inset a key-value pair
dht12_1  | Sending Some Great Book 1:Some Great Value 1 of hash 4 into node dht16@192.168.80.2 on index 16
dht16_1  | Sending Some Great Book 1:Some Great Value 1 of hash 4 into node dht4@192.168.80.4 on index 4
dht4_1   | Inserting Some Great Book 1:Some Great Value 1 of hash 4 into node dht4@192.168.80.4 on index 4
dht12_1  | Sending Some Great Book 2:Some Great Value 2 of hash 5 into node dht16@192.168.80.2 on index 16
dht16_1  | Sending Some Great Book 2:Some Great Value 2 of hash 5 into node dht1@192.168.80.5 on index 1
dht1_1   | Sending Some Great Book 2:Some Great Value 2 of hash 5 into node dht4@192.168.80.4 on index 4
dht4_1   | Sending Some Great Book 2:Some Great Value 2 of hash 5 into node dht8@192.168.80.6 on index 8
dht8_1   | Inserting Some Great Book 2:Some Great Value 2 of hash 5 into node dht8@192.168.80.6 on index 8
dht12_1  | Sending Some Great Book 2:Some Great Value 3 of hash 5 into node dht16@192.168.80.2 on index 16
dht16_1  | Sending Some Great Book 2:Some Great Value 3 of hash 5 into node dht1@192.168.80.5 on index 1
dht1_1   | Sending Some Great Book 2:Some Great Value 3 of hash 5 into node dht4@192.168.80.4 on index 4
dht4_1   | Sending Some Great Book 2:Some Great Value 3 of hash 5 into node dht8@192.168.80.6 on index 8
dht8_1   | Inserting Some Great Book 2:Some Great Value 3 of hash 5 into node dht8@192.168.80.6 on index 8
dht12_1  | Sending Some Great Book 2:Some Great Value 4 of hash 5 into node dht16@192.168.80.2 on index 16
dht16_1  | Sending Some Great Book 2:Some Great Value 4 of hash 5 into node dht1@192.168.80.5 on index 1
dht1_1   | Sending Some Great Book 2:Some Great Value 4 of hash 5 into node dht4@192.168.80.4 on index 4
dht4_1   | Sending Some Great Book 2:Some Great Value 4 of hash 5 into node dht8@192.168.80.6 on index 8
dht8_1   | Inserting Some Great Book 2:Some Great Value 4 of hash 5 into node dht8@192.168.80.6 on index 8


# Get a key
dht1_1   | Searching for Some Great Book in node dht1@192.168.80.5 that has index 1...
dht1_1   | Key Some Great Book NOT found in node dht1@192.168.80.5 ... Sending to subsequent node dht4@192.168.80.4...
dht4_1   | Searching for Some Great Book in node dht4@192.168.80.4 that has index 4...
dht4_1   | Key Some Great Book NOT found in node dht4@192.168.80.4 ... Sending to subsequent node dht8@192.168.80.6...
dht8_1   | Searching for Some Great Book in node dht8@192.168.80.6 that has index 8...
dht8_1   | Key Some Great Book NOT found in node dht8@192.168.80.6 ... Sending to subsequent node dht12@192.168.80.3...
dht12_1  | Searching for Some Great Book in node dht12@192.168.80.3 that has index 12...
dht12_1  | Key Some Great Book NOT found in node dht12@192.168.80.3 ... Sending to subsequent node dht16@192.168.80.2...
dht16_1  | Searching for Some Great Book in node dht16@192.168.80.2 that has index 16...
dht16_1  | Key Some Great Book NOT found in node dht16@192.168.80.2 ... Sending to subsequent node dht1@192.168.80.5...
dht1_1   | The searching process for Some Great Book reached a loop, sending NOT FOUND to client
dht1_1   | Searching for Some Great Book 1 in node dht1@192.168.80.5 that has index 1...
dht1_1   | Key Some Great Book 1 NOT found in node dht1@192.168.80.5 ... Sending to subsequent node dht4@192.168.80.4...
dht4_1   | Searching for Some Great Book 1 in node dht4@192.168.80.4 that has index 4...
dht4_1   | Key Some Great Book 1 found in node dht4@192.168.80.4 that has index 4...
dht1_1   | Searching for Some Great Book 2 in node dht1@192.168.80.5 that has index 1...
dht1_1   | Key Some Great Book 2 NOT found in node dht1@192.168.80.5 ... Sending to subsequent node dht4@192.168.80.4...
dht4_1   | Searching for Some Great Book 2 in node dht4@192.168.80.4 that has index 4...
dht4_1   | Key Some Great Book 2 NOT found in node dht4@192.168.80.4 ... Sending to subsequent node dht8@192.168.80.6...
dht8_1   | Searching for Some Great Book 2 in node dht8@192.168.80.6 that has index 8...
dht8_1   | Key Some Great Book 2 found in node dht8@192.168.80.6 that has index 8...

# Leave command
dht4_1   | a LEAVE command was sent to node dht4@192.168.80.4.
dht1_1   | Heartbeat from dht1 to dht4 failed, changing nodes chain.
dht1_1   | Subsequent 1 hostname is now: dht8@192.168.80.6
dht1_1   | Subsequent 2 hostname is now: dht12
dht16_1  | Changed SUBSEQUENT2_HOSTNAME to dht8@192.168.80.6 with index of 8.

# Join command
dht4_1   | a JOIN command was sent to node dht4@192.168.80.4.
dht1_1   | Changed SUBSEQUENT2_HOSTNAME to dht8@192.168.80.6 with index of 8.
dht1_1   | Changed SUBSEQUENT1_HOSTNAME to dht4@192.168.80.4 with index of 4.
dht8_1   | Changed PREVIOUS_HOSTNAME to dht4@192.168.80.4 with index of 4.
dht16_1  | Changed SUBSEQUENT2_HOSTNAME to dht4@192.168.80.4 with index of 4.
```

## Application Design:
- Assumes a circular arrangement of peers.
- Each peer will hold a small subset of the totality of the (key, value) pairs.
- Keys  are  content  names  (e.g.,  names  of  movies,  albums,  and  software,  or  file),  and  the  value  is  be  the  any data  at  which  the  content  is  stored;  in  this  case,  an  example  key-value  pair  is  (Led  Zeppelin  IV,  Some Value).
- Each Peer should provide the following services to a user:
    - Insert a (content name,  data) pair into the DHT – we are assuming that the user has a content at his key that they want the DHT to be aware of.
    - The user enters the content name and their data
    - The peer should then store the (content name, data) pair in one of the peers in the DHT
- Retrieve data values corresponding to a given content name
    - The user enters a content name
    - The peer should return the list of all the data values where the content is available
    - The user should contact one of the can do whatever with the data .
- Maintain DHT when a peer:
    - Abruptly leaves the DHT
    - Wants to join the DHT
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const express = require('express');
const http = require('http');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 10000;

// Enable CORS for all routes
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

const server = http.createServer(app);

// Create WebSocket server attached to the HTTP server
const wss = new WebSocket.Server({ 
    server,
    verifyClient: (info, cb) => {
        const origin = info.origin;
        console.log('WebSocket connection attempt from:', origin);
        // Send back proper headers in the callback
        cb(true, 200, '', {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST',
            'Access-Control-Allow-Headers': 'Content-Type'
        });
    }
});

// Store active game rooms
const rooms = new Map();

wss.on('connection', (ws, req) => {
    console.log('New client connected from:', req.socket.remoteAddress);
    let clientRoom = null;

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            switch (data.type) {
                case 'init':
                    console.log('Client initialized:', data.clientType);
                    ws.send(JSON.stringify({
                        type: 'initAck',
                        message: 'Connection established'
                    }));
                    break;

                case 'createRoom':
                    const roomId = uuidv4().substring(0, 6).toUpperCase();
                    rooms.set(roomId, {
                        host: ws,
                        players: new Set([ws]),
                        gameStarted: false
                    });
                    clientRoom = roomId;
                    ws.send(JSON.stringify({
                        type: 'roomCreated',
                        roomId: roomId
                    }));
                    console.log(`Room created: ${roomId}`);
                    break;

                case 'joinRoom':
                    // Normalize room ID to uppercase
                    const normalizedRoomId = data.roomId.trim().toUpperCase();
                    const room = rooms.get(normalizedRoomId);
                    
                    if (!room) {
                        console.log(`Room not found: ${normalizedRoomId}`);
                        console.log('Available rooms:', Array.from(rooms.keys()));
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'Room not found. Please check the room code and try again.'
                        }));
                        return;
                    }

                    if (room.gameStarted) {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'Game already in progress'
                        }));
                        return;
                    }

                    room.players.add(ws);
                    clientRoom = normalizedRoomId;

                    ws.send(JSON.stringify({
                        type: 'joinedRoom',
                        roomId: normalizedRoomId,
                        playerNumber: 2  // Joining player is always player 2
                    }));

                    room.host.send(JSON.stringify({
                        type: 'playerJoined',
                        playerId: ws.id,
                        playerNumber: 1  // Host is always player 1
                    }));

                    if (room.players.size === 2) {
                        room.gameStarted = true;
                        room.players.forEach(player => {
                            player.send(JSON.stringify({
                                type: 'gameStart'
                            }));
                        });
                    }
                    break;

                case 'playerUpdate':
                    const playerRoom = rooms.get(data.roomId);
                    if (playerRoom) {
                        playerRoom.players.forEach(player => {
                            if (player !== ws) {
                                player.send(JSON.stringify({
                                    type: 'playerUpdate',
                                    playerId: ws.id,
                                    position: data.position,
                                    animation: data.animation
                                }));
                            }
                        });
                    }
                    break;

                case 'gameOver':
                    // Find the room
                    const gameOverRoom = rooms.get(data.roomId);
                    if (gameOverRoom) {
                        // Broadcast game over to all players in the room except sender
                        gameOverRoom.players.forEach(player => {
                            if (player !== ws && player.readyState === WebSocket.OPEN) {
                                player.send(JSON.stringify({
                                    type: 'gameOver',
                                    playerId: ws.id,
                                    score: data.score
                                }));
                            }
                        });
                    }
                    break;

                case 'playAgainRequest':
                    const playAgainRoom = rooms.get(data.roomId);
                    if (playAgainRoom) {
                        // Send play again request to other player
                        playAgainRoom.players.forEach(player => {
                            if (player !== ws && player.readyState === WebSocket.OPEN) {
                                player.send(JSON.stringify({
                                    type: 'playAgainRequest',
                                    playerId: ws.id
                                }));
                            }
                        });
                    }
                    break;

                case 'playAgainAccepted':
                    console.log('playAgainAccepted', data);
                    const acceptRoom = rooms.get(data.roomId);
                    if (acceptRoom) {
                        // Reset game state
                        acceptRoom.gameStarted = true;
                        // Notify all players to start new game
                        acceptRoom.players.forEach(player => {
                            player.send(JSON.stringify({
                                type: 'playAgainAccepted'
                            }));
                        });
                    }
                    break;

                case 'playAgainDeclined':
                    const declineRoom = rooms.get(data.roomId);
                    if (declineRoom) {
                        // Notify other player that request was declined
                        declineRoom.players.forEach(player => {
                            if (player !== ws && player.readyState === WebSocket.OPEN) {
                                player.send(JSON.stringify({
                                    type: 'playAgainDeclined',
                                    playerId: ws.id
                                }));
                            }
                        });
                    }
                    break;
            }
        } catch (error) {
            console.error('Error handling message:', error);
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Invalid message format'
            }));
        }
    });

    ws.id = uuidv4();

    ws.on('close', () => {
        console.log('Client disconnected');
        if (clientRoom) {
            const room = rooms.get(clientRoom);
            if (room) {
                room.players.delete(ws);
                room.players.forEach(player => {
                    player.send(JSON.stringify({
                        type: 'playerLeft',
                        playerId: ws.id
                    }));
                });
                if (room.players.size === 0) {
                    rooms.delete(clientRoom);
                    console.log(`Room ${clientRoom} deleted`);
                }
            }
        }
    });
});

// Add a health check endpoint
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// Start the server
server.listen(port, () => {
    console.log(`Server is running on port ${port}`);
}).on('error', (err) => {
    console.error('Server error:', err);
    process.exit(1);
}); 
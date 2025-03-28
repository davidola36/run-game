import { Character } from './character.js';
import * as THREE from 'three';

export class MultiplayerManager {
    constructor(gameInstance) {
        this.game = gameInstance;
        this.socket = null;
        this.opponents = new Map();
        this.opponentScores = new Map();
        this.opponentCurrentAnimation = 'Survey';
        this.roomId = null;
        this.isHost = false;
        this.playerNumber = null;
        this.playerLabels = new Map();
        this.connectionAttempts = 0;
        this.maxReconnectAttempts = 3;
        this.reconnectTimeout = null;
        this.isConnecting = false;
        this.setupWebSocket();
    }

    setupWebSocket() {
        if (this.isConnecting) {
            console.log('Connection attempt already in progress');
            return;
        }

        try {
            this.isConnecting = true;

            // Clean up existing connection
            if (this.socket) {
                this.socket.onclose = null;
                this.socket.onerror = null;
                this.socket.onmessage = null;
                this.socket.onopen = null;
                this.socket.close();
                this.socket = null;
            }

            // Clear any existing reconnection timeout
            if (this.reconnectTimeout) {
                clearTimeout(this.reconnectTimeout);
                this.reconnectTimeout = null;
            }

            // Get the WebSocket URL from environment variable or construct from window location
            const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = import.meta.env.VITE_WS_URL || 
                         `${wsProtocol}//${window.location.hostname}:${window.location.port}`;

            console.log('Attempting WebSocket connection to:', wsUrl);
            this.socket = new WebSocket(wsUrl);

            this.socket.onopen = () => {
                console.log('Successfully connected to WebSocket server');
                this.connectionAttempts = 0;
                this.isConnecting = false;

                // Send initial handshake message
                this.socket.send(JSON.stringify({
                    type: 'init',
                    clientType: 'player'
                }));
            };

            this.socket.onclose = (event) => {
                // Don't attempt to reconnect if it was a protocol error
                if (event.code === 1002) { // Protocol error
                    console.log('WebSocket closed due to protocol error - not attempting reconnect');
                    this.isConnecting = false;
                    this.game.endGame('Connection Error: Protocol error occurred');
                    return;
                }

                console.log('WebSocket disconnected:', {
                    code: event.code,
                    reason: event.reason,
                    wasClean: event.wasClean,
                    attempts: this.connectionAttempts
                });
                
                this.isConnecting = false;

                // End the game if we were in a room
                if (this.roomId) {
                    this.game.endGame('Connection to game server lost');
                }

                // Only attempt reconnect if we haven't exceeded max attempts
                if (this.connectionAttempts < this.maxReconnectAttempts) {
                    console.log(`Attempting to reconnect... (${this.connectionAttempts + 1}/${this.maxReconnectAttempts})`);
                    this.connectionAttempts++;
                    
                    // Set new timeout for reconnection
                    this.reconnectTimeout = setTimeout(() => {
                        this.setupWebSocket();
                    }, 2000);
                } else {
                    console.log('Max reconnection attempts reached');
                    this.isConnecting = false;
                    this.game.endGame('Unable to reconnect to game server');
                }
            };

            this.socket.onerror = (error) => {
                console.error('WebSocket error:', error);
                console.log('WebSocket state:', this.socket.readyState);
                console.log('Current URL:', window.location.href);
                console.log('Attempted WS URL:', wsUrl);
                this.isConnecting = false;
                
                if (this.roomId) {
                    this.game.endGame('Connection error occurred');
                }
            };

            this.socket.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    // console.log('Received message:', message);
                    this.handleMessage(message);
                } catch (error) {
                    console.error('Error parsing message:', error);
                }
            };
        } catch (error) {
            console.error('Error setting up WebSocket:', error);
            console.log('Setup error details:', error.message);
            this.isConnecting = false;
            
            if (this.roomId) {
                this.game.endGame('Failed to establish connection');
            } else if (this.connectionAttempts === 0) {
                alert('Failed to connect to game server. Please try again.');
            }
        }
    }


    removePlayerLabel(playerId) {
        const label = this.playerLabels.get(playerId);
        if (label) {
            this.game.scene.remove(label);
            if (label.material) {
                label.material.dispose();
            }
            if (label.geometry) {
                label.geometry.dispose();
            }
            this.playerLabels.delete(playerId);
        }
    }

   

    handleMessage(message) {
        // Ignore messages if we're disposing
        if (!this.socket) {
            return;
        }

        switch (message.type) {
            case 'roomCreated':
                this.roomId = message.roomId;
                // Create label for local player
                this.game.showRoomCode(message.roomId);
                break;

            case 'joinedRoom':
                this.roomId = message.roomId;
                this.isHost = false;
                this.playerNumber = 2;
                // Create label for local player
                console.log('Successfully joined room:', message.roomId, 'as player', this.playerNumber);
                break;

            case 'playerJoined':
                console.log('New player joined:', message.playerId);
                if (message.playerNumber) {
                    this.playerNumber = message.playerNumber;
                }
                // Update local player label position
                break;

            case 'gameStart':
                console.log('Game starting...');
                this.game.startMultiplayerGame();
                break;

            case 'playerUpdate':
                this.updateOpponentPosition(message.playerId, message.position, message.animation);
                // Store opponent's score
                if (message.score !== undefined) {
                    this.opponentScores.set(message.playerId, message.score);
                }
                break;

            case 'gameOver':
                console.log('Game Over received:', message);
                // Store final score for the player who lost
                if (message.score !== undefined && message.playerId) {
                    this.opponentScores.set(message.playerId, message.score);
                }
                // End the game for this player too
                this.game.currentState = this.game.gameStates.GAME_OVER;
                this.game.updateMenuScreen();
                break;

            case 'playerLeft':
                this.removeOpponent(message.playerId);
                if (this.socket) { // Only end game if we haven't already cleaned up
                    this.game.endGame('Other player has left the game');
                }
                break;

            case 'playAgainRequest':
                console.log('Received play again request from:', message.playerId);
                // Show the play again prompt to the player
                this.game.showPlayAgainPrompt(message.playerId);
                break;

            case 'playAgainAccepted':
                console.log('Play again request accepted');
                // Reset scores
                this.opponentScores.clear();
                // Start new game
                this.game.startMultiplayerGame();
                break;

            case 'playAgainDeclined':
                console.log('Play again request declined');
                this.game.endGame('Other player declined to play again');
                break;

            case 'error':
                console.error('Server error:', message.message);
                if (this.socket) { // Only end game if we haven't already cleaned up
                    this.game.endGame(`Game Error: ${message.message}`);
                }
                break;
        }
    }

    createRoom() {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            console.error('WebSocket not connected. State:', this.socket ? this.socket.readyState : 'null');
            alert('Not connected to server. Please wait while we reconnect...');
            this.setupWebSocket();
            return;
        }

        console.log('Creating room...');
        this.isHost = true;  // Set host flag when creating room
        this.playerNumber = 1;  // Host is always player 1
        this.socket.send(JSON.stringify({
            type: 'createRoom'
        }));
    }

    joinRoom(roomId) {
        if (!roomId) {
            alert('Please enter a room code');
            return;
        }

        // Normalize the room code to uppercase and trim whitespace
        roomId = roomId.trim().toUpperCase();

        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            console.error('WebSocket not connected. State:', this.socket ? this.socket.readyState : 'null');
            alert('Not connected to server. Please wait while we reconnect...');
            this.setupWebSocket();
            return;
        }

        console.log('Joining room:', roomId);
        this.socket.send(JSON.stringify({
            type: 'joinRoom',
            roomId: roomId
        }));
    }

    sendGameOver() {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN || !this.roomId) {
            return;
        }

        console.log('Sending game over state');
        this.socket.send(JSON.stringify({
            type: 'gameOver',
            roomId: this.roomId,
            playerId: this.socket.id, // Include sender's ID
            score: this.game.score
        }));
    }

    sendPlayerUpdate(position, animation) {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN || !this.roomId) {
            return;
        }

        // Send the virtual position and score
        this.socket.send(JSON.stringify({
            type: 'playerUpdate',
            roomId: this.roomId,
            position: position,
            animation: animation,
            score: this.game.score
        }));
    }

    async updateOpponentPosition(playerId, position, animation) {
        let opponent = this.opponents.get(playerId);
        const currentZPosition = this.game.character.getVirtualPosition().z 
        
        if (!opponent) {
            // Create new opponent character if it doesn't exist
            console.log('Creating new opponent character for player:', playerId);
            opponent = new Character(this.game.scene, false, 'Player 2');
            this.opponents.set(playerId, opponent);
        }
        if (opponent && position) {
            if (opponent.model) {
                console.log('opponent', position.z, this.game.character.getPosition());

                // Update opponent's position directly
                opponent.setPosition(position.x, position.y, position.z - currentZPosition);

                // Update animation if provided
                if (animation != opponent.currentAnimation) {
                    // Debug logging for animation state
                    opponent.playAnimation(animation, null, true);
                }
            } else {
                console.log('Waiting for opponent model to load...');
            }
        }
    }

    removeOpponent(playerId) {
        const opponent = this.opponents.get(playerId);
        if (opponent) {
            opponent.dispose();
            this.opponents.delete(playerId);
            this.removePlayerLabel(playerId);
        }
    }

    dispose() {
        // Remove all player labels
        for (const playerId of this.playerLabels.keys()) {
            this.removePlayerLabel(playerId);
        }
        this.playerLabels.clear();

        // Remove all opponents
        for (const [playerId, opponent] of this.opponents) {
            this.removeOpponent(playerId);
        }
        this.opponents.clear();

        // Clear any pending reconnection timeout
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
        
        // Store roomId before cleanup
        const wasInRoom = this.roomId;
        this.roomId = null;
        
        // Clean up WebSocket connection
        if (this.socket) {
            const ws = this.socket;
            this.socket = null;
            ws.onclose = null;
            ws.onerror = null;
            ws.onmessage = null;
            ws.onopen = null;
            ws.close();
        }
    }

    requestPlayAgain() {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN || !this.roomId) {
            return;
        }

        console.log('Sending play again request');
        this.socket.send(JSON.stringify({
            type: 'playAgainRequest',
            roomId: this.roomId
        }));
    }

    acceptPlayAgain() {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN || !this.roomId) {
            return;
        }

        console.log('Accepting play again request');
        this.socket.send(JSON.stringify({
            type: 'playAgainAccepted',
            roomId: this.roomId
        }));
        
        // Reset scores
        this.opponentScores.clear();
        // Note: We don't call startMultiplayerGame here anymore since it's called in handleMessage
    }

    declinePlayAgain() {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN || !this.roomId) {
            return;
        }

        console.log('Declining play again request');
        this.socket.send(JSON.stringify({
            type: 'playAgainDeclined',
            roomId: this.roomId
        }));
        
        this.game.endGame('Declined play again request');
    }

    determineWinner() {
        const playerScore = this.game.score;
        let highestOpponentScore = 0;
        let winner = 'You';
        let winningScore = playerScore;

        console.log('Determining winner:');
        console.log('Your score:', playerScore);
        console.log('Opponent scores:', Array.from(this.opponentScores.entries()));

        // Find the highest opponent score
        for (const [playerId, score] of this.opponentScores) {
            console.log(`Player ${playerId} score:`, score);
            if (score > highestOpponentScore) {
                highestOpponentScore = score;
                winner = `Player ${playerId}`;
                winningScore = score;
            }
        }

        // Compare with player's score
        if (playerScore > highestOpponentScore) {
            return `You Won! (Score: ${playerScore})`;
        } else if (playerScore === highestOpponentScore) {
            return `It's a tie! (Score: ${playerScore})`;
        } else {
            return `${winner} Won! (Score: ${winningScore})`;
        }
    }

    getInitialPosition() {
        // Return the initial position based on player number
        const characterStartHeight = 1;  // Height above the road
        const laneWidth = this.game.laneWidth;  // Get lane width from game

        if (this.playerNumber === 1) {
            // Player 1 starts in left lane
            return { 
                x: -laneWidth/2,  // Left lane
                y: characterStartHeight, 
                z: 0 
            };
        } else {
            // Player 2 starts in right lane
            return { 
                x: laneWidth/2,  // Right lane
                y: characterStartHeight, 
                z: 0 
            };
        }
    }

    updateOpponentAnimations(deltaTime) {
        this.opponents.forEach(opponent => {
            if (opponent.mixer) {
                opponent.mixer.update(deltaTime);
            }
        });
    }

} 
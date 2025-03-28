export class Game {
    constructor() {
        // ... existing constructor code ...
    }

    initializePlayer() {
        // Create the player character
        this.player = new Character(this.scene, true, 'Player 1');
        
        // Set initial position
        this.player.setPosition(0, 0, 0);
    }

    endGame(message) {
        // Prevent multiple endGame calls
        if (!this.isGameRunning) {
            return;
        }

        // Stop any ongoing game mechanics
        this.isGameRunning = false;
        
        // Clean up multiplayer resources first
        if (this.multiplayerManager) {
            // Remove the reference to avoid circular calls
            const manager = this.multiplayerManager;
            this.multiplayerManager = null;
            manager.dispose();
        }
        
        // Show game end message
        const gameEndMessage = document.createElement('div');
        gameEndMessage.style.position = 'fixed';
        gameEndMessage.style.top = '50%';
        gameEndMessage.style.left = '50%';
        gameEndMessage.style.transform = 'translate(-50%, -50%)';
        gameEndMessage.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        gameEndMessage.style.color = 'white';
        gameEndMessage.style.padding = '20px';
        gameEndMessage.style.borderRadius = '10px';
        gameEndMessage.style.fontSize = '24px';
        gameEndMessage.style.textAlign = 'center';
        gameEndMessage.style.zIndex = '1000';
        gameEndMessage.innerHTML = message;

        // Add a return to menu button
        const returnButton = document.createElement('button');
        returnButton.innerHTML = 'Return to Menu';
        returnButton.style.marginTop = '20px';
        returnButton.style.padding = '10px 20px';
        returnButton.style.fontSize = '18px';
        returnButton.style.cursor = 'pointer';
        returnButton.style.backgroundColor = '#4CAF50';
        returnButton.style.border = 'none';
        returnButton.style.borderRadius = '5px';
        returnButton.style.color = 'white';
        returnButton.onclick = () => {
            document.body.removeChild(gameEndMessage);
            this.resetGameState();
            this.showMainMenu();
        };

        gameEndMessage.appendChild(document.createElement('br'));
        gameEndMessage.appendChild(returnButton);
        document.body.appendChild(gameEndMessage);
    }

    resetGameState() {
        // Reset all game-related states
        this.isGameRunning = false;
        
        // Clean up player
        if (this.player) {
            this.player.dispose();
            this.player = null;
        }

        // Clean up any remaining game elements
        // Add any other cleanup specific to your game
    }

    showMainMenu() {
        // Only proceed if we're not already showing the menu
        if (this.currentState === 'MENU') {
            return;
        }

        this.currentState = 'MENU';
        // Rest of your showMainMenu implementation
    }

    updateScene() {
        if (!this.isGameRunning || !this.player) return;

        // Update player and animations
        const deltaTime = this.clock.getDelta();
        this.player.update(deltaTime);

        // Update opponents
        if (this.multiplayerManager) {
            for (const opponent of this.multiplayerManager.opponents.values()) {
                opponent.update(deltaTime);
            }
        }

        // Update camera to follow player
        if (this.camera) {
            this.camera.position.x = this.scene.position.x;
            this.camera.position.z = this.scene.position.z + 10;
        }

        // Render the scene
        if (this.renderer) {
            this.renderer.render(this.scene, this.camera);
        }
    }

  

    // ... rest of the class methods ...
} 
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { Character } from './character.js';
import { Environment } from './environment.js';
import { Obstacle } from './obstacle.js';
import { PoseController } from './poseController.js';
import * as dat from 'dat.gui';
import { MultiplayerManager } from './multiplayer.js';

class Game {
    constructor() {
        // Add mixer property for animations
        this.mixer = null;
        this.animations = {};

        // Store GUI instance
        this.gui = null;

        // Scene setup with skybox
        this.scene = new THREE.Scene();
        this.setupSkybox();
        this.scene.fog = null;
        
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        
        // Renderer setup with better exposure
        this.renderer = new THREE.WebGLRenderer({ 
            antialias: true,
            powerPreference: "high-performance",
            stencil: false,
            depth: true
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Limit pixel ratio
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 2.0;
        
        // Add texture loading optimization
        THREE.TextureLoader.prototype.crossOrigin = 'anonymous';
        THREE.TextureLoader.prototype.load = function(url, onLoad, onProgress, onError) {
            const texture = new THREE.Texture();
            const image = new Image();
            image.crossOrigin = 'anonymous';
            
            image.onload = function() {
                texture.image = image;
                texture.needsUpdate = true;
                if (onLoad) onLoad(texture);
            };
            
            image.onerror = function() {
                if (onError) onError(new Error('Failed to load texture: ' + url));
            };
            
            if (onProgress) {
                image.onprogress = function(e) {
                    if (e.lengthComputable) {
                        onProgress({ loaded: e.loaded, total: e.total });
                    }
                };
            }
            
            image.src = url;
            return texture;
        };
        
        // DOM elements
        this.container = document.getElementById('game-container');
        this.container.appendChild(this.renderer.domElement);
        this.scoreElement = document.getElementById('score');

        // Setup lighting first
        this.setupLighting();

        // Initialize environment
        this.environment = new Environment(this.scene);

         // Settings object for GUI controls
         this.settings = {
            zombie: {
                scale: 0.01,  // Start with a reasonable initial scale
                height: 1,
                rotationSpeed: 0.5,
                bobbingSpeed: 1,
                bobbingAmplitude: 0.05
            },
            game: {
                spawnRate: 0.03,
                obstacleSpeed: 0.2,
                spawnDistance: 30, // Initial spawn distance
                roadWidth: this.environment.roadWidth,
                roadLength: this.environment.roadLength
            },
            debug: {
                showHitbox: false
            }
        };

        // Game properties - Initialize these after environment
        this.obstacles = [];
        this.score = 0;
        this.speed = this.settings.game.obstacleSpeed;
        this.lastTime = 0;
        this.isMovingLeft = false;
        this.isMovingRight = false;
        this.isMovingForward = false;
        this.lateralSpeed = 0.3;
        this.laneWidth = this.environment.roadWidth / 2; // Now environment exists
        this.maxLateralPosition = 8;
        this.roadOffset = 1; // Increased from 1 to 100 to spawn obstacles much further away
        this.currentLane = 0; // 0 = left lane, 1 = right lane
        this.isJumping = false;
        this.isDucking = false;
        this.jumpHeight = 5;
        this.jumpSpeed = 0.2;
        this.gravity = 0.4;
        this.verticalSpeed = 0;
        this.horizontalSpeed = 0;
        this.maxHorizontalSpeed = this.laneWidth / 10;
        
        // Position bounds
        this.minX = -this.laneWidth / 2;
        this.maxX = this.laneWidth / 2;

        // Game states
        this.gameStates = {
            MENU: 'menu',
            PLAYING: 'playing',
            PAUSED: 'paused',
            GAME_OVER: 'gameOver',
            MULTIPLAYER_LOBBY: 'multiplayerLobby'
        };
        this.currentState = this.gameStates.MENU;

        // Camera settings
        this.cameraOffset = new THREE.Vector3(0, 8, 20);
        this.cameraTarget = new THREE.Vector3(0, 2, -15);
        this.camera.position.copy(this.cameraOffset);
        this.camera.lookAt(this.cameraTarget);

        // Setup UI
        this.setupUI();

        // Control scheme
        this.controlScheme = 'keyboard'; // 'keyboard' or 'pose'
        this.poseController = null;
        
        // Initialize character
        this.character = new Character(this.scene);

        // Event listeners
        window.addEventListener('resize', this.onWindowResize.bind(this));
        document.addEventListener('keydown', this.onKeyDown.bind(this));
        document.addEventListener('keyup', this.onKeyUp.bind(this));

        // Initialize loader for obstacles
        this.loader = new GLTFLoader();
        this.loader.setDRACOLoader(new DRACOLoader().setDecoderPath('/draco/'));
        this.loader.setKTX2Loader(new KTX2Loader());
        this.zombieModel = null;

        // Add model cache
        this.modelCache = new Map();

        // Setup GUI with control scheme toggle
        this.setupGUI();
        
        // Initialize pose controller
        this.initializePoseController();

        // Add multiplayer properties
        this.multiplayerManager = null;
        this.isMultiplayer = false;
        this.opponentScore = 0;

        // Start game loop
        this.animate();
    }

    async initializePoseController() {
        if (!this.poseController) {
            this.poseController = new PoseController(this.handlePoseControls.bind(this), this.gui);
            const initialized = await this.poseController.initialize();
            if (initialized) {
                console.log('Pose controller initialized successfully');
                return true;
            } else {
                console.error('Failed to initialize pose controller');
                return false;
            }
        }
        return true;
    }

    setupGUI() {
        // Create GUI instance
        this.gui = new dat.GUI({ 
            width: 300
        });

        // Position the GUI container
        const guiContainer = document.getElementsByClassName('dg main')[0];
        if (guiContainer) {
            guiContainer.style.position = 'fixed';
            guiContainer.style.bottom = '20px';
            guiContainer.style.left = '20px';
            guiContainer.style.zIndex = '9999';
        }

        // Game settings
        const gameFolder = this.gui.addFolder('Game Settings');
        gameFolder.add(this.settings.game, 'spawnRate', 0.01, 0.1).name('Spawn Frequency');
        gameFolder.add(this.settings.game, 'obstacleSpeed', 0.1, 2).name('Game Speed');
        gameFolder.add(this.settings.game, 'spawnDistance', 20, 100).name('Spawn Distance');

        // Control scheme toggle
        const controlsFolder = this.gui.addFolder('Controls');
        controlsFolder.add(this, 'controlScheme', ['keyboard', 'pose', 'touch'])
            .name('Control Type')
            .onChange(async (value) => {
                if (value === 'pose') {
                    this.removeTouchControls();
                    if (!this.poseController) {
                        await this.initializePoseController();
                    }
                    await this.poseController.start();
                } else if (value === 'touch') {
                    if (this.poseController) {
                        this.poseController.stop();
                    }
                    this.initializeTouchControls();
                } else {
                    if (this.poseController) {
                        this.poseController.stop();
                    }
                    this.removeTouchControls();
                }
            });

        // Add calibration button for pose controls
        controlsFolder.add({
            calibrate: async () => {
                if (this.poseController) {
                    const calibrated = await this.poseController.calibrate();
                    if (calibrated) {
                        console.log('Calibration successful');
                    } else {
                        console.error('Calibration failed');
                    }
                }
            }
        }, 'calibrate').name('Calibrate Pose');

        // Open Controls folder by default
        controlsFolder.open();
    }

    handlePoseControls(movements) {
        console.log('movements', JSON.stringify(movements.walking));

        if (!movements) return;

        // Handle walking - update game speed based on walking detection
        if (movements.walking) {
            // Set forward movement flag
            console.log('walking', movements.walking);
            this.isMovingForward = true;
            // Gradually increase speed to make movement smoother
            this.speed = Math.min(this.speed + 0.01, this.settings.game.obstacleSpeed * 1.5);
        } else {
            // When not walking, gradually slow down
            this.isMovingForward = false;
            // this.speed = Math.max(this.speed - 0.01, 0);
        }

        // Handle left/right movement
        if (movements.left && this.character.position.x > this.minX) {
            this.horizontalSpeed = -this.maxHorizontalSpeed;
        } else if (movements.right && this.character.position.x < this.maxX) {
            this.horizontalSpeed = this.maxHorizontalSpeed;
        } else {
            // Gradually slow down
            this.horizontalSpeed *= 0.9;
        }

        // Apply horizontal movement with bounds checking
        const newX = this.character.position.x + this.horizontalSpeed;
        if (newX >= this.minX && newX <= this.maxX) {
            this.character.position.x = newX;
        }

        // Handle jumping
        if (movements.jump && !this.isJumping) {
            this.isJumping = true;
            this.verticalSpeed = this.jumpSpeed;
        }

        // Handle ducking
        this.isDucking = movements.duck;
        if (this.isDucking) {
            this.character.scale.y = 0.5;
        } else {
            this.character.scale.y = 1;
        }
        
    }

    setupUI() {
        // Create menu screen with mobile-friendly styling
        this.menuScreen = document.createElement('div');
        this.menuScreen.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.8);
            padding: ${this.isMobileDevice() ? '30px' : '20px'};
            border-radius: 10px;
            text-align: center;
            color: white;
            font-family: Arial, sans-serif;
            min-width: ${this.isMobileDevice() ? '80%' : 'auto'};
            max-width: 90%;
            font-size: ${this.isMobileDevice() ? '1.2em' : '1em'};
            cursor: pointer;
            touch-action: manipulation;
        `;

        // Add touch/click event listeners to menu screen
        this.menuScreen.addEventListener('touchend', (event) => {
            // Don't handle touch events if they're on a button or input
            if (event.target.tagName.toLowerCase() === 'button' || 
                event.target.tagName.toLowerCase() === 'input') {
                return;
            }

            event.preventDefault();
            if (this.currentState === this.gameStates.MENU || 
                this.currentState === this.gameStates.GAME_OVER) {
                this.startGame();
            } else if (this.currentState === this.gameStates.PAUSED) {
                this.togglePause();
            }
        });

        this.container.appendChild(this.menuScreen);

        // Create pause button with mobile-friendly sizing
        this.pauseButton = document.createElement('button');
        this.pauseButton.innerHTML = '⏸️';
        this.pauseButton.style.cssText = `
            position: absolute;
            top: 20px;
            left: 20px;
            background: none;
            border: none;
            color: white;
            font-size: ${this.isMobileDevice() ? '32px' : '24px'};
            padding: ${this.isMobileDevice() ? '15px' : '10px'};
            cursor: pointer;
            z-index: 1000;
            touch-action: manipulation;
        `;
        this.pauseButton.onclick = () => this.togglePause();
        this.container.appendChild(this.pauseButton);

        this.updateMenuScreen();
    }

    updateMenuScreen() {
        let content = '';
        const isMobile = this.isMobileDevice();
        
        // Only switch to touch controls if we're not using pose controls
        if (isMobile && this.controlScheme === 'keyboard') {
            this.controlScheme = 'touch';
            this.initializeTouchControls();
        }

        switch (this.currentState) {
            case this.gameStates.MENU:
                content = `
                    <h1>Endless Runner</h1>
                    <div style="margin: 20px 0;">
                        <button onclick="window.game.startGame()" 
                                style="padding: 10px 20px; margin: 5px; background: #4CAF50; 
                                       border: none; border-radius: 5px; color: white; cursor: pointer;">
                            Single Player
                        </button>
                        <button onclick="window.game.showMultiplayerOptions()" 
                                style="padding: 10px 20px; margin: 5px; background: #2196F3; 
                                       border: none; border-radius: 5px; color: white; cursor: pointer;">
                            Multiplayer
                        </button>
                    </div>
                    ${isMobile ? `
                        <p>Tap Screen to Start</p>
                        <div style="margin: 15px 0; padding: 10px; background: rgba(255,255,255,0.1); border-radius: 8px;">
                            <p style="margin: 5px 0">👆 Tap to Jump</p>
                            <p style="margin: 5px 0">👈 Swipe Left/Right to Move 👉</p>
                        </div>
                    ` : `
                        <p>Press SPACE to Start</p>
                        <p>Use Arrow Keys to Move</p>
                        <p>Press ESC to Pause</p>
                    `}
                    <div style="margin-top: 20px; padding: 15px; background: rgba(255,255,255,0.1); border-radius: 8px;">
                        <h3 style="margin: 0 0 10px 0;">Control Options</h3>
                        <div style="display: flex; flex-direction: column; gap: 10px;">
                            <button onclick="window.game.setControlScheme('keyboard')" 
                                    style="padding: 10px; background: ${this.controlScheme === 'keyboard' ? '#4CAF50' : '#666'}; 
                                           border: none; border-radius: 5px; color: white; cursor: pointer;">
                                Keyboard Controls
                            </button>
                            <button onclick="window.game.setControlScheme('pose')" 
                                    style="padding: 10px; background: ${this.controlScheme === 'pose' ? '#4CAF50' : '#666'}; 
                                           border: none; border-radius: 5px; color: white; cursor: pointer;">
                                Pose Controls
                            </button>
                            ${isMobile ? `
                                <button onclick="window.game.setControlScheme('touch')" 
                                        style="padding: 10px; background: ${this.controlScheme === 'touch' ? '#4CAF50' : '#666'}; 
                                               border: none; border-radius: 5px; color: white; cursor: pointer;">
                                    Touch Controls
                                </button>
                            ` : ''}
                        </div>
                        ${this.controlScheme === 'pose' ? `
                            <div style="margin-top: 15px; padding: 10px; background: rgba(0,0,0,0.2); border-radius: 5px;">
                                <p style="margin: 5px 0">🎮 How to use Pose Controls:</p>
                                <p style="margin: 5px 0">1. Stand in front of your camera</p>
                                <p style="margin: 5px 0">2. Move left/right to control direction</p>
                                <p style="margin: 5px 0">3. Jump in place to jump</p>
                                <p style="margin: 5px 0">4. Duck to avoid obstacles</p>
                                <p style="margin: 5px 0">5. Walk in place to move forward</p>
                            </div>
                        ` : ''}
                    </div>
                `;
                break;
            case this.gameStates.GAME_OVER:
                let gameOverContent = `
                    <h1>Game Over!</h1>
                    <p>Your Score: ${this.score}</p>`;
                
                if (this.isMultiplayer && this.multiplayerManager) {
                    const winner = this.multiplayerManager.determineWinner();
                    gameOverContent += `
                        <p style="font-size: 24px; color: #4CAF50; margin: 20px 0;">${winner}</p>
                        <p>${isMobile ? 'Tap Screen' : 'Press SPACE'} to Play Again</p>`;
                } else {
                    gameOverContent += `
                        <p>${isMobile ? 'Tap Screen' : 'Press SPACE'} to Play Again</p>`;
                }

                // Add Back to Menu button
                gameOverContent += `
                    <div style="margin-top: 20px;">
                        <button onclick="window.game.endGame()" 
                                style="padding: 10px 20px; 
                                       background: #2196F3; 
                                       border: none; 
                                       border-radius: 5px; 
                                       color: white; 
                                       cursor: pointer;
                                       font-size: 16px;">
                            Back to Menu
                        </button>
                    </div>`;
                
                content = gameOverContent;
                break;
            case this.gameStates.PAUSED:
                content = `
                    <h1>Paused</h1>
                    <p>${isMobile ? 'Tap Screen' : 'Press ESC'} to Resume</p>
                    <p>Current Score: ${this.score}</p>
                    <div style="margin-top: 20px;">
                        <button onclick="window.game.endGame()" 
                                style="padding: 10px 20px; 
                                       background: #ff4444; 
                                       border: none; 
                                       border-radius: 5px; 
                                       color: white; 
                                       cursor: pointer;
                                       font-size: 16px;">
                            End Game
                        </button>
                    </div>
                `;
                break;
            case this.gameStates.MULTIPLAYER_LOBBY:
                content = `
                    <h1>Multiplayer Lobby</h1>
                    <div style="margin: 20px 0;">
                        <button onclick="window.game.createMultiplayerRoom()" 
                                style="padding: 10px 20px; margin: 5px; background: #4CAF50; 
                                       border: none; border-radius: 5px; color: white; cursor: pointer;">
                            Create Room
                        </button>
                        <div style="margin: 20px 0;">
                            <input type="text" id="roomCodeInput" placeholder="Enter Room Code"
                                   style="padding: 10px; margin-right: 10px; border-radius: 5px; border: 1px solid #ccc;">
                            <button onclick="window.game.joinMultiplayerRoom(document.getElementById('roomCodeInput').value)" 
                                    style="padding: 10px 20px; background: #2196F3; 
                                           border: none; border-radius: 5px; color: white; cursor: pointer;">
                                Join Room
                            </button>
                        </div>
                    </div>
                `;
                break;
        }
        this.menuScreen.innerHTML = content;
        this.menuScreen.style.display = this.currentState === this.gameStates.PLAYING ? 'none' : 'block';
        this.pauseButton.style.display = this.currentState === this.gameStates.PLAYING ? 'block' : 'none';
    }

    // Add new method for handling play again requests
    handlePlayAgainRequest() {
        if (this.isMultiplayer && this.multiplayerManager && this.currentState === this.gameStates.GAME_OVER) {
            console.log('Requesting play again from other player...');
            this.menuScreen.innerHTML = `
                <h1>Waiting for other player...</h1>
                <p>Requested to play again</p>
            `;
            this.multiplayerManager.requestPlayAgain();
            return true;
        }
        return false;
    }

    startGame() {
        // Reset game state
        console.log('starting game', this.character.getPosition());
        this.cleanupScene();
        this.score = 0;
        this.currentState = this.gameStates.PLAYING;
        this.obstacles = [];
        this.isMovingForward = false;
        this.speed = this.settings.game.obstacleSpeed;

        // Create character if needed
        if (!this.character) {
            this.character = new Character(this.scene, true);
        }

        // Position character based on game mode
        const characterStartHeight = this.roadOffset + this.character.characterHeight/2;
        let lanePosition;
        
        if (this.isMultiplayer && this.multiplayerManager) {
            // In multiplayer, host is on left lane, other player on right lane
            const isHost = this.multiplayerManager.isHost;
            console.log('Multiplayer positioning:', { isHost, laneWidth: this.laneWidth });
            lanePosition = isHost ? -this.laneWidth/2 : this.laneWidth/2;
        } else {
            // In single player, always start in the middle left lane
            lanePosition = -this.laneWidth/2;
        }

        // Reset character state first
        this.character.reset();
        
        // Then set the correct lane position
        this.character.setPosition(lanePosition, characterStartHeight, 0);
        this.character.virtualPosition.set(lanePosition, characterStartHeight, 0);
        
        console.log('character position:', {
            lanePosition,
            characterHeight: this.character.characterHeight,
            roadOffset: this.roadOffset,
            laneWidth: this.laneWidth,
            isMultiplayer: this.isMultiplayer,
            isHost: this.multiplayerManager?.isHost
        });

        // Create initial set of obstacles
        this.initializeObstacles();

        // Update menu screen
        this.updateMenuScreen();
    }

    togglePause() {
        if (this.currentState === this.gameStates.PLAYING) {
            this.currentState = this.gameStates.PAUSED;
            // If using pose controls, pause video processing but keep feed visible
            if (this.controlScheme === 'pose' && this.poseController) {
                // Keep video visible but pause processing
                this.poseController.detectionInterval && clearInterval(this.poseController.detectionInterval);
            }
        } else if (this.currentState === this.gameStates.PAUSED) {
            this.currentState = this.gameStates.PLAYING;
            // If using pose controls, resume video processing
            if (this.controlScheme === 'pose' && this.poseController) {
                this.poseController.startDetectionLoop();
            }
        }
        this.updateMenuScreen();
    }

    cleanupScene() {
        // Safety check
        if (!this.obstacles || !Array.isArray(this.obstacles)) {
            this.obstacles = [];
        }

        // Clean up obstacles
        this.obstacles.forEach(obstacle => obstacle.dispose());
        this.obstacles = [];

        // Store character and its label temporarily if they exist
        let characterModel = null;
        let characterLabel = null;
        if (this.character && this.character.model) {
            characterModel = this.character.model;
            characterLabel = this.character.labelMesh;
            this.scene.remove(characterModel);
        }

        // Store opponent models temporarily if they exist
        const opponentModels = new Map();
        if (this.isMultiplayer && this.multiplayerManager) {
            for (const [playerId, opponent] of this.multiplayerManager.opponents) {
                if (opponent && opponent.model) {
                    opponentModels.set(playerId, opponent.model);
                    this.scene.remove(opponent.model);
                }
            }
        }

        // Remove all objects from the scene except lights
        while (this.scene.children.length > 0) {
            const object = this.scene.children[0];
            if (object.type === 'DirectionalLight' || 
                object.type === 'AmbientLight' || 
                object.type === 'PointLight') {
                // Skip lights
                this.scene.children.shift();
                continue;
            }
            // Remove the object
            this.scene.remove(object);
        }

        // Reinitialize essential game elements
        this.environment = new Environment(this.scene);

        // Restore character if it exists
        if (characterModel) {
            this.scene.add(characterModel);
            if (characterLabel) {
                characterModel.add(characterLabel);
            }
        }

        // Restore opponent models if they exist
        if (this.isMultiplayer && this.multiplayerManager) {
            for (const [playerId, model] of opponentModels) {
                if (model) {
                    this.scene.add(model);
                }
            }
        }
    }

    setupLighting() {
        // Add ambient light with increased intensity
        this.ambientLight = new THREE.AmbientLight(0xffffff, 1.5); // Increased from 1.0 to 1.5
        this.scene.add(this.ambientLight);

        // Add hemisphere light for sky and ground illumination with increased intensity
        this.hemisphereLight = new THREE.HemisphereLight(0x88ccff, 0x88cc66, 1.5); // Increased from 1.0 to 1.5
        this.hemisphereLight.position.set(0, 50, 0);
        this.scene.add(this.hemisphereLight);

        // Add main directional light (sun) with increased intensity
        this.mainLight = new THREE.DirectionalLight(0xffffff, 1.5); // Increased from 1.2 to 1.5
        this.mainLight.position.set(10, 30, -10);
        this.mainLight.castShadow = true;

        // Improve shadow quality
        this.mainLight.shadow.mapSize.width = 2048;
        this.mainLight.shadow.mapSize.height = 2048;
        this.mainLight.shadow.camera.near = 0.1;
        this.mainLight.shadow.camera.far = 100;
        this.mainLight.shadow.camera.left = -50;
        this.mainLight.shadow.camera.right = 50;
        this.mainLight.shadow.camera.top = 50;
        this.mainLight.shadow.camera.bottom = -50;
        this.mainLight.shadow.bias = -0.001;

        this.scene.add(this.mainLight);

        // Add fill lights with increased intensity
        this.fillLight1 = new THREE.DirectionalLight(0xffffff, 0.8); // Increased from 0.5 to 0.8
        this.fillLight1.position.set(-10, 20, -5);
        this.scene.add(this.fillLight1);

        this.fillLight2 = new THREE.DirectionalLight(0xffffff, 0.8); // Increased from 0.5 to 0.8
        this.fillLight2.position.set(10, 20, -5);
        this.scene.add(this.fillLight2);
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    onKeyDown(event) {
        switch(event.key) {
            case 'Escape':
                if (this.currentState === this.gameStates.PLAYING || 
                    this.currentState === this.gameStates.PAUSED) {
                    this.togglePause();
                }
                break;
            case ' ':
                if (this.currentState === this.gameStates.MENU) {
                    this.startGame();
                    return;
                }
                if (this.currentState === this.gameStates.GAME_OVER) {
                    // Handle multiplayer play again request
                    if (this.isMultiplayer && this.multiplayerManager) {
                        this.handlePlayAgainRequest();
                    } else {
                        this.startGame();
                    }
                    return;
                }
                if (this.currentState === this.gameStates.PLAYING) {
                    this.character.jump();
                }
                break;
            case 'ArrowLeft':
                if (this.currentState === this.gameStates.PLAYING) {
                    this.isMovingLeft = true;
                }
                break;
            case 'ArrowRight':
                if (this.currentState === this.gameStates.PLAYING) {
                    this.isMovingRight = true;
                }
                break;
            case 'ArrowUp':
                if (this.currentState === this.gameStates.PLAYING) {
                    this.isMovingForward = true;
                }
                break;
        }
    }

    onKeyUp(event) {
        switch(event.key) {
            case 'ArrowLeft':
                this.isMovingLeft = false;
                break;
            case 'ArrowRight':
                this.isMovingRight = false;
                break;
            case 'ArrowUp':
                this.isMovingForward = false;
                break;
        }
    }

    updatePlayerPosition(deltaTime) {
        if (!this.character) return;


        const currentPos = this.character.getPosition();
        const currentVirtualPos = this.character.getVirtualPosition();
        let newX = currentPos.x;

        // Handle left/right movement
        if (this.isMovingLeft && newX > -this.maxLateralPosition) {
            newX -= this.lateralSpeed;
        }
        if (this.isMovingRight && newX < this.maxLateralPosition) {
            newX += this.lateralSpeed;
        }

        // Update character position
        this.character.setPosition(newX, currentPos.y, 0);
        // this.character.updateLabelPosition();
        // Handle forward movement regardless of jumping state
        if (this.isMovingForward) {
            currentVirtualPos.z -= this.speed;
            this.character.setVirtualPosition(currentVirtualPos.x, currentVirtualPos.y, currentVirtualPos.z);
        }

        // Update character animation based on movement state
        if (!this.character.isJumping && !this.character.isFalling) {
            if (this.isMovingForward) {
                this.character.playAnimation('Run');
            } else {
                this.character.playAnimation('Survey');
            }
        }

        // Rotate character based on movement direction
        if (this.character.model) {
            let targetRotation = Math.PI; // Default rotation (facing camera)
            
            if (this.isMovingLeft) {
                targetRotation = Math.PI + Math.PI / 4; // 45 degrees left
            } else if (this.isMovingRight) {
                targetRotation = Math.PI - Math.PI / 4; // 45 degrees right
            }
            
            // Smoothly interpolate to target rotation
            this.character.model.rotation.y = THREE.MathUtils.lerp(
                this.character.model.rotation.y,
                targetRotation,
                0.1
            );
        }
    }

    moveWorldForward(deltaTime) {
        // Move obstacles and update environment based on current speed
        // if (this.speed > 0) {
            // Move obstacles
            for (let i = this.obstacles.length - 1; i >= 0; i--) {
                const obstacle = this.obstacles[i];
                obstacle.update(deltaTime, this.speed);
                
                // Remove obstacles that are behind the camera
                if (obstacle.isBehindCamera()) {
                    obstacle.dispose();
                    this.obstacles.splice(i, 1);
                }
            }

            // Update environment with current speed
            this.environment.update(deltaTime, this.speed);
        // }
    }

    updateCamera() {
        if (!this.character) return;
        
        // Update camera position to follow player
        const playerPos = this.character.getPosition();
        const cameraTargetPosition = new THREE.Vector3(
            playerPos.x * 0.5,
            this.cameraOffset.y,
            playerPos.z + this.cameraOffset.z
        );
        
        this.camera.position.lerp(cameraTargetPosition, 0.1);
        this.camera.lookAt(
            playerPos.x * 0.5,
            playerPos.y + 2,
            playerPos.z - 5
        );
    }

    updateGame(deltaTime) {
        console.log('updating game');
        if (this.currentState !== this.gameStates.PLAYING) return;

        // Update player position
        this.updatePlayerPosition(deltaTime);

        // Update camera
        this.updateCamera();

        // Only spawn obstacles when moving forward using spawn rate from settings
        if (this.isMovingForward && (this.obstacles.length === 0 || Math.random() < this.settings.game.spawnRate)) {
            this.createObstacle();
        }

        // Update obstacles only when moving forward
        if (this.isMovingForward) {
            this.moveWorldForward(deltaTime);

            // Update score only when moving forward
            this.score += Math.round(this.speed * 10);
            this.scoreElement.textContent = 'Score: ' + this.score;
            
            // Increase speed gradually
            this.speed += 0.0001;
        }

        // Check for collisions
        this.checkCollisions();

        // Send position updates in multiplayer mode
        // if (this.isMultiplayer && this.multiplayerManager) {
        //     const playerPos = this.character.getVirtualPosition();
        //     const currentAnimation = this.character.currentAnimation;
        //     this.multiplayerManager.sendPlayerUpdate(playerPos, currentAnimation);
        // }
    }

    createTestObstacle() {
        if (this.character && this.character.model) {
            console.log('Creating test obstacle to verify Fox model');
            const obstacle = this.character.model.clone();
            
            // Set position in front of camera
            obstacle.position.set(0, this.roadOffset + 1, -20);
            obstacle.rotation.y = Math.PI;
            
            // Set scale
            const scale = this.settings.zombie.scale;
            obstacle.scale.set(scale, scale, scale);
            
            // Make sure everything is visible
            obstacle.traverse((child) => {
                child.visible = true;
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    if (child.material) {
                        child.material.metalness = 0.2;
                        child.material.roughness = 0.8;
                        child.material.needsUpdate = true;
                    }
                }
            });
            
            // Add to scene
            this.scene.add(obstacle);
            console.log('Test Fox obstacle added to scene at:', obstacle.position);
        } else {
            console.error('Cannot create test obstacle - Fox model not loaded');
        }
    }

    createObstacle() {
        // Create new obstacle with settings
        const obstacle = new Obstacle(this.scene, this.settings);
        this.obstacles.push(obstacle);
    }

    checkCollisions() {
        if (!this.character) return;
        
        const playerPos = this.character.getPosition();
        const collisionBox = new THREE.Box3().setFromCenterAndSize(
            playerPos,
            new THREE.Vector3(0.5, this.character.characterHeight, 0.5)  // Match character's actual size
        );
        
        for (const obstacle of this.obstacles) {
            if (collisionBox.intersectsBox(obstacle.getCollisionBox())) {
                this.currentState = this.gameStates.GAME_OVER;
                // Send game over state if in multiplayer
                if (this.isMultiplayer && this.multiplayerManager) {
                    console.log('Collision detected, sending game over');
                    this.multiplayerManager.sendGameOver();
                }
                this.updateMenuScreen();
                return;
            }
        }
    }

    animate() {
        // Always request next frame first
        requestAnimationFrame(() => this.animate());

        // Calculate delta time
        const currentTime = performance.now();
        const deltaTime = (currentTime - this.lastTime) / 1000;
        this.lastTime = currentTime;

        // Only update game logic if playing
        if (this.currentState === this.gameStates.PLAYING) {
            // Update game state
            this.updateGame(deltaTime);

            // Update character animations
            if (this.character && this.character.mixer) {
                this.character.update(deltaTime);
            }

            // Update multiplayer positions and labels
            if (this.isMultiplayer && this.multiplayerManager) {
                // Send position update to other players
                if (this.character && this.character.model) {
                    let characterPosition = this.character.getVirtualPosition();
                    const position = {
                        x: this.character.model.position.x,
                        y: this.character.model.position.y,
                        z: characterPosition.z
                    };
                    this.multiplayerManager.sendPlayerUpdate(position, this.character.currentAnimation);
                }
                
                // Update opponent animations
                this.multiplayerManager.updateOpponentAnimations(deltaTime);
            }
        }

        // Always render the scene
        this.renderer.render(this.scene, this.camera);
    }

    setupSkybox() {
        // Create skybox geometry
        const skyboxGeometry = new THREE.BoxGeometry(10000, 10000, 10000);
        
        // Create skybox materials
        const skyboxMaterials = [
            new THREE.MeshBasicMaterial({ color: 0x87CEEB }), // Right
            new THREE.MeshBasicMaterial({ color: 0x87CEEB }), // Left
            new THREE.MeshBasicMaterial({ color: 0x87CEEB }), // Top
            new THREE.MeshBasicMaterial({ color: 0x87CEEB }), // Bottom
            new THREE.MeshBasicMaterial({ color: 0x87CEEB }), // Front
            new THREE.MeshBasicMaterial({ color: 0x87CEEB }), // Back
        ];
        
        // Create skybox
        const skybox = new THREE.Mesh(skyboxGeometry, skyboxMaterials);
        this.scene.add(skybox);
    }

    initializeTouchControls() {
        this.touchStartX = null;
        this.touchStartY = null;
        this.swipeThreshold = 50; // minimum distance for a swipe
        this.touchStartTime = null;
        this.maxSwipeTime = 300; // maximum time for a swipe in milliseconds

        // Add touch event listeners
        document.addEventListener('touchstart', this.handleTouchStart.bind(this));
        document.addEventListener('touchmove', this.handleTouchMove.bind(this));
        document.addEventListener('touchend', this.handleTouchEnd.bind(this));

        // Add touch instructions
        this.showTouchInstructions();
    }

    showTouchInstructions() {
        // Remove existing instructions if they exist
        if (this.touchInstructions) {
            this.touchInstructions.remove();
        }

        const instructions = document.createElement('div');
        instructions.id = 'touch-instructions';
        instructions.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background-color: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 20px;
            border-radius: 12px;
            text-align: center;
            z-index: 10000;
            font-family: Arial, sans-serif;
            font-size: 18px;
            width: 80%;
            max-width: 300px;
            box-shadow: 0 0 10px rgba(0,0,0,0.5);
            border: 2px solid rgba(255,255,255,0.3);
            pointer-events: none;
        `;
        instructions.innerHTML = `
            <div style="margin-bottom: 15px; font-size: 24px; font-weight: bold;">Touch Controls</div>
            <div style="margin-bottom: 10px;">👆 Tap to Start/Jump</div>
            <div>👈 Swipe Left/Right to Move 👉</div>
        `;
        document.body.appendChild(instructions);
        this.touchInstructions = instructions;

        // Auto-hide instructions after 5 seconds
        setTimeout(() => {
            if (this.touchInstructions) {
                this.touchInstructions.style.transition = 'opacity 1s';
                this.touchInstructions.style.opacity = '0';
                setTimeout(() => {
                    if (this.touchInstructions) {
                        this.touchInstructions.remove();
                        this.touchInstructions = null;
                    }
                }, 1000);
            }
        }, 5000);
    }

    removeTouchControls() {
        document.removeEventListener('touchstart', this.handleTouchStart.bind(this));
        document.removeEventListener('touchmove', this.handleTouchMove.bind(this));
        document.removeEventListener('touchend', this.handleTouchEnd.bind(this));
        
        if (this.touchInstructions) {
            this.touchInstructions.remove();
            this.touchInstructions = null;
        }
    }

    handleTouchStart(event) {
        this.touchStartX = event.touches[0].clientX;
        this.touchStartY = event.touches[0].clientY;
        this.touchStartTime = Date.now();
    }

    handleTouchMove(event) {
        if (!this.touchStartX || !this.touchStartY) return;

        const touchEndX = event.touches[0].clientX;
        const touchEndY = event.touches[0].clientY;
        const deltaX = touchEndX - this.touchStartX;
        const deltaY = touchEndY - this.touchStartY;
        const deltaTime = Date.now() - this.touchStartTime;

        // Only handle horizontal swipes that occur within the time limit
        if (Math.abs(deltaX) > Math.abs(deltaY) && deltaTime < this.maxSwipeTime) {
            event.preventDefault(); // Prevent scrolling
            
            if (Math.abs(deltaX) > this.swipeThreshold) {
                if (deltaX > 0) {
                    this.isMovingRight = true;
                    this.isMovingLeft = false;
                } else {
                    this.isMovingLeft = true;
                    this.isMovingRight = false;
                }
            }
        }
    }

    handleTouchEnd(event) {
        const deltaTime = Date.now() - this.touchStartTime;
        const deltaX = event.changedTouches[0].clientX - this.touchStartX;

        // If it's a quick tap without much movement
        if (Math.abs(deltaX) < this.swipeThreshold && deltaTime < 300) {
            if (this.currentState === this.gameStates.MENU || 
                this.currentState === this.gameStates.GAME_OVER) {
                this.startGame();
            } else if (this.currentState === this.gameStates.PAUSED) {
                this.togglePause();
            } else if (this.currentState === this.gameStates.PLAYING) {
                this.character.jump();
            }
        }

        // Reset movement flags
        this.isMovingLeft = false;
        this.isMovingRight = false;
        this.touchStartX = null;
        this.touchStartY = null;
        this.touchStartTime = null;
    }

    isMobileDevice() {
        return (
            /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
            (window.innerWidth <= 800 && window.innerHeight <= 900)
        );
    }

    // Add method to set control scheme
    setControlScheme(scheme) {
        this.controlScheme = scheme;
        if (scheme === 'pose') {
            this.initializePoseController().then(() => {
                if (this.poseController) {
                    this.poseController.start();
                }
            });
        } else if (this.poseController) {
            this.poseController.stop();
        }
        this.updateMenuScreen();
    }

    // Add method to end the game
    endGame() {
        // Reset score
        this.score = 0;
        
        // Reset game state
        this.speed = this.settings.game.obstacleSpeed;
        this.isMovingLeft = false;
        this.isMovingRight = false;
        this.isMovingForward = false;
        
        // Clean up the scene
        this.cleanupScene();
        
        // Update score display
        if (this.scoreElement) {
            this.scoreElement.textContent = 'Score: 0';
        }
        
        // Go back to menu
        this.currentState = this.gameStates.MENU;
        this.updateMenuScreen();
        
        // If using pose controls, stop the pose controller
        if (this.controlScheme === 'pose' && this.poseController) {
            this.poseController.stop();
        }

        // Clean up multiplayer if active
        if (this.isMultiplayer && this.multiplayerManager) {
            this.multiplayerManager.dispose();
            this.multiplayerManager = null;
            this.isMultiplayer = false;
        }
    }

    // Add multiplayer methods
    initializeMultiplayer() {
        this.multiplayerManager = new MultiplayerManager(this);
        this.isMultiplayer = true;
    }

    createMultiplayerRoom() {
        if (!this.multiplayerManager) {
            console.log('Initializing multiplayer manager for room creation...');
            this.multiplayerManager = new MultiplayerManager(this);
        }
        this.multiplayerManager.createRoom();
    }

    joinMultiplayerRoom(roomId) {
        if (!this.multiplayerManager) {
            console.log('Initializing multiplayer manager for room joining...');
            this.multiplayerManager = new MultiplayerManager(this);
        }
        this.multiplayerManager.joinRoom(roomId);
    }

    showRoomCode(roomId) {
        // Update the menu screen to show the room code
        const roomCodeDisplay = document.createElement('div');
        roomCodeDisplay.style.cssText = `
            margin: 20px 0;
            padding: 15px;
            background: rgba(255,255,255,0.1);
            border-radius: 8px;
            font-size: 24px;
        `;
        roomCodeDisplay.innerHTML = `
            <h3>Room Code:</h3>
            <div style="font-size: 32px; font-weight: bold; color: #4CAF50;">${roomId}</div>
            <p style="font-size: 16px; margin-top: 10px;">Share this code with your friend to join the game</p>
        `;
        
        // Find the existing room code display if any and remove it
        const existingRoomCode = this.menuScreen.querySelector('#room-code-display');
        if (existingRoomCode) {
            existingRoomCode.remove();
        }
        
        // Add the new room code display
        roomCodeDisplay.id = 'room-code-display';
        this.menuScreen.appendChild(roomCodeDisplay);
    }

    startMultiplayerGame() {
        console.log('starting multiplayer game')
        // Set multiplayer flag
        this.isMultiplayer = true;
        
        // Clean up the scene
        this.cleanupScene();
        
        // Reset game state variables
        this.score = 0;
        this.speed = this.settings.game.obstacleSpeed;
        this.obstacles = [];
        this.isMovingLeft = false;
        this.isMovingRight = false;
        this.isMovingForward = false;
        this.lastTime = performance.now();
        // this.currentState = this.gameStates.PLAYING;
              
        
        // Initialize pose controller if needed
        if (this.controlScheme === 'pose' && !this.poseController) {
            this.initializePoseController();
        }
        
        // Hide menu and start the game
        this.menuScreen.style.display = 'none';
        this.startGame();
        
    }

    handleMultiplayerDisconnect() {
        alert('Disconnected from multiplayer game');
        this.isMultiplayer = false;
        this.currentState = this.gameStates.MENU;
        this.updateMenuScreen();
    }

    // Add method to show multiplayer options
    showMultiplayerOptions() {
        // Initialize multiplayer manager if not already done
        if (!this.multiplayerManager) {
            console.log('Initializing multiplayer manager...');
            this.multiplayerManager = new MultiplayerManager(this);
        }
        this.currentState = this.gameStates.MULTIPLAYER_LOBBY;
        this.updateMenuScreen();
    }

    showPlayAgainPrompt(playerId) {
        const content = `
            <h1>Play Again?</h1>
            <p>${playerId} wants to play again!</p>
            <div style="margin: 20px 0;">
                <button onclick="window.game.acceptPlayAgain()" 
                        style="padding: 10px 20px; margin: 5px; background: #4CAF50; 
                               border: none; border-radius: 5px; color: white; cursor: pointer;">
                    Play Again
                </button>
                <button onclick="window.game.declinePlayAgain()" 
                        style="padding: 10px 20px; margin: 5px; background: #f44336; 
                               border: none; border-radius: 5px; color: white; cursor: pointer;">
                    Return to Menu
                </button>
            </div>
        `;
        this.menuScreen.innerHTML = content;
        this.menuScreen.style.display = 'block';
    }

    acceptPlayAgain() {
        if (this.multiplayerManager) {
            this.multiplayerManager.acceptPlayAgain();
        }
    }

    declinePlayAgain() {
        if (this.multiplayerManager) {
            this.multiplayerManager.declinePlayAgain();
        }
    }

    initializeSettings() {
        console.log('initializing settings', this.settings.game.roadWidth);
        this.settings = {
            game: {
                speed: 0.2,
                spawnRate: 0.03,
                spawnDistance: 30, // Initial spawn distance
                roadWidth: this.environment.roadWidth,
                roadLength: this.environment.roadLength,
                obstacleSpeed: 0.2
            },
            debug: {
                showHitbox: false
            }
        };

        // Initialize GUI if in debug mode
        if (this.debug) {
            this.gui = new GUI();
            const gameFolder = this.gui.addFolder('Game Settings');
            gameFolder.add(this.settings.game, 'speed', 0.1, 1).name('Game Speed');
            gameFolder.add(this.settings.game, 'spawnRate', 0.01, 0.1).name('Spawn Rate');
            gameFolder.add(this.settings.game, 'spawnDistance', 20, 100).name('Spawn Distance');
            gameFolder.add(this.settings.game, 'obstacleSpeed', 0.1, 1).name('Obstacle Speed');
            
            const debugFolder = this.gui.addFolder('Debug');
            debugFolder.add(this.settings.debug, 'showHitbox').name('Show Hitbox');
        }
    }

    initializeObstacles() {
        // Create initial obstacles from spawn distance to end of road
        const startZ = -this.settings.game.spawnDistance;
        const endZ = -this.settings.game.roadLength;
        const spacing = 15;  // Space between obstacles
        
        // Calculate how many obstacles we can fit
        const distance = Math.abs(endZ - startZ);
        const numberOfObstacles = Math.floor(distance / spacing);
        
        console.log('Creating initial obstacles:', {
            startZ,
            endZ,
            spacing,
            numberOfObstacles
        });

        // Create obstacles from near to far
        for(let i = 0; i < numberOfObstacles; i++) {
            const z = startZ - (i * spacing);  // Start close and move further
            this.createInitialObstacle(z);
        }
    }

    createInitialObstacle(zPosition) {
        const obstacle = new Obstacle(this.scene, {
            ...this.settings,
            game: {
                ...this.settings.game,
                spawnDistance: Math.abs(zPosition)  // Override spawn distance
            }
        });
        this.obstacles.push(obstacle);
    }
}

// Start the game
window.game = new Game(); 
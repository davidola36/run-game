import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader';
import { Character } from './character.js';
import { Environment } from './environment.js';
import { Obstacle } from './obstacle.js';
import { PoseController } from './poseController.js';
import * as dat from 'dat.gui';

class Game {
    constructor() {
        // Add mixer property for animations
        this.mixer = null;
        this.animations = {};
        
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
                obstacleSpeed: 0.2
            }
        };

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
            GAME_OVER: 'gameOver'
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
        this.character = new Character(this.scene, () => {
            const characterStartHeight = this.roadOffset + this.character.characterHeight/2;
            this.character.setPosition(0, characterStartHeight, 0);
        });

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
        
        // Automatically set control scheme based on device
        if (isMobile && this.controlScheme === 'keyboard') {
            this.controlScheme = 'touch';
            if (this.poseController) {
                console.log('in menu')
                this.poseController.stop();
            }
            this.initializeTouchControls();
        }

        switch (this.currentState) {
            case this.gameStates.MENU:
                content = `
                    <h1>Endless Runner</h1>
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
                `;
                break;
            case this.gameStates.GAME_OVER:
                content = `
                    <h1>Game Over!</h1>
                    <p>Score: ${this.score}</p>
                    <p>${isMobile ? 'Tap Screen' : 'Press SPACE'} to Play Again</p>
                `;
                break;
            case this.gameStates.PAUSED:
                content = `
                    <h1>Paused</h1>
                    <p>${isMobile ? 'Tap Screen' : 'Press ESC'} to Resume</p>
                    <p>Current Score: ${this.score}</p>
                `;
                break;
        }
        this.menuScreen.innerHTML = content;
        this.menuScreen.style.display = this.currentState === this.gameStates.PLAYING ? 'none' : 'block';
        this.pauseButton.style.display = this.currentState === this.gameStates.PLAYING ? 'block' : 'none';
    }

    startGame() {
        // Clean up the scene first
        this.cleanupScene();
        
        // Reset game state
        this.score = 0;
        this.speed = this.settings.game.obstacleSpeed;
        this.obstacles = []; // Ensure obstacles array is empty
        this.isMovingLeft = false;
        this.isMovingRight = false;
        this.isMovingForward = false;
        
        // Position character correctly on the road
        if (this.character) {
            const characterStartHeight = this.roadOffset + this.character.characterHeight/2;
            this.character.setPosition(0, characterStartHeight, 0);
        }

        // Initialize pose controller if needed
        if (this.controlScheme === 'pose') {
            console.log('Displaying video element', this.poseController);
            if (!this.poseController) {
                this.initializePoseController().then(() => {
                    this.poseController.start();
                });
            }
        }

        // Then start the game
        this.currentState = this.gameStates.PLAYING;
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

        // Store reference to our character before cleanup
        const currentCharacter = this.character;

        // Remove all objects from the scene except lights, essential elements, and character
        while (this.scene.children.length > 0) {
            const object = this.scene.children[0];
            if (object.type === 'DirectionalLight' || 
                object.type === 'AmbientLight' || 
                object.type === 'PointLight' ||
                (currentCharacter && object === currentCharacter.model)) {
                // Skip lights and character model
                this.scene.children.shift();
                continue;
            }
            // Remove the object
            this.scene.remove(object);
        }

        // Reinitialize essential game elements
        this.environment = new Environment(this.scene);
        
        // Re-add our character if it exists
        if (currentCharacter && currentCharacter.model) {
            this.scene.add(currentCharacter.model);
            this.character = currentCharacter;
        }

        // Clean up pose controller
        // if (this.poseController) {
        //     this.poseController.cleanup();
        // }
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
                if (this.currentState === this.gameStates.MENU || 
                    this.currentState === this.gameStates.GAME_OVER) {
                    this.startGame();
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

        // Handle forward movement regardless of jumping state
        if (this.isMovingForward) {
            this.moveWorldForward(deltaTime);
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
        console.log('speed', this.speed);
        // Move obstacles and update environment based on current speed
        // if (this.speed > 0) {
            // Move obstacles
            for (let i = this.obstacles.length - 1; i >= 0; i--) {
                const obstacle = this.obstacles[i];
                obstacle.update(this.speed, deltaTime);
                
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
        if (this.currentState !== this.gameStates.PLAYING) return;

        // Update character
        if (this.character) {
            this.character.update(deltaTime);
        }

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
            // Update score only when moving forward
            this.score += Math.round(this.speed * 10);
            this.scoreElement.textContent = 'Score: ' + this.score;
            
            // Increase speed gradually
            this.speed += 0.0001;
        }

        // Check for collisions
        this.checkCollisions();
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
        // Check cache first
        if (this.modelCache.has('obstacle')) {
            const cachedModel = this.modelCache.get('obstacle');
            const obstacle = new Obstacle(this.scene, this.environment.roadWidth, this.environment.roadLength, cachedModel);
            this.scene.add(obstacle.mesh);
            this.obstacles.push(obstacle);
            return;
        }

        // If not in cache, load and cache it
        const obstacle = new Obstacle(this.scene, this.environment.roadWidth, this.environment.roadLength);
        this.scene.add(obstacle.mesh);
        this.obstacles.push(obstacle);
        
        // Cache the model for future use
        if (obstacle.mesh) {
            this.modelCache.set('obstacle', obstacle.mesh);
        }
    }

    checkCollisions() {
        if (!this.character) return;
        
        const playerPos = this.character.getPosition();
        const collisionBox = new THREE.Box3().setFromCenterAndSize(
            playerPos,
            new THREE.Vector3(1, this.character.characterHeight, 1)
        );
        
        for (const obstacle of this.obstacles) {
            if (collisionBox.intersectsBox(obstacle.getCollisionBox())) {
                this.currentState = this.gameStates.GAME_OVER;
                this.updateMenuScreen();
            }
        }
    }

    animate(currentTime = 0) {
        requestAnimationFrame(this.animate.bind(this));

        // Calculate delta time
        const deltaTime = (currentTime - this.lastTime) / 1000;
        this.lastTime = currentTime;

        // Ensure video feed visibility in pose control mode
        if (this.controlScheme === 'pose' && 
            this.poseController && 
            this.poseController.videoElement) {
            this.poseController.videoElement.style.display = 'block';
        }

        // Only update game if in PLAYING state
        if (this.currentState === this.gameStates.PLAYING) {
            // Update game state
            this.updateGame(deltaTime);
            
            // Update character animations
            if (this.character) {
                this.character.update(deltaTime);
            }

            // Update player position and camera
            this.updatePlayerPosition(deltaTime);
            this.updateCamera();

            // Move world forward if moving forward
            if (this.isMovingForward) {
                this.moveWorldForward(deltaTime);
            }
        }

        // Render scene
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
}

// Start the game
new Game(); 
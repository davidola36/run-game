import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';

export class Character {
    constructor(scene, isLocalPlayer = true, playerLabel = 'player') {
        this.scene = scene;
        this.isLocalPlayer = isLocalPlayer;
        this.playerLabel = playerLabel;
        this.mixer = null;
        this.model = null;
        this.animations = {};
        this.actions = {};
        this.currentAction = null;
        this.currentAnimation = 'Survey';
        this.state = 'idle';
        this.modelPath = 'models/Fox/glTF/Fox.gltf';
        this.labelMesh = null;
        this.characterHeight = 2;
        this.isLoaded = false;

        // Character properties
        this.position = new THREE.Vector3(0, 0, 0);
        this.virtualPosition = new THREE.Vector3(0, 0, 0);
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.jumpSpeed = 10;
        this.gravity = -20;
        this.roadOffset = 1;
        this.minHeight = this.roadOffset + 1;
        this.isJumping = false;
        this.isFalling = false;

        // Create temporary cube placeholder while model loads
        const geometry = new THREE.BoxGeometry(0.5, this.characterHeight, 0.5);
        const material = new THREE.MeshPhongMaterial({ 
            color: this.isLocalPlayer ? 0x00ff00 : 0xff0000,
            transparent: true, 
            opacity: 0.5 
        });
        this.placeholder = new THREE.Mesh(geometry, material);
        this.placeholder.castShadow = true;
        this.placeholder.position.y = this.minHeight;
        this.scene.add(this.placeholder);

        // Load character model and create label
        this.loadModel().then(() => {
            if (this.playerLabel) {
                this.createPlayerLabel();
            }
        });
    }

    createPlayerLabel() {
        // Create player label
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 256;
        canvas.height = 128;

        // Draw label background
        context.fillStyle = 'rgba(0, 0, 0, 0.5)';
        context.fillRect(0, 0, canvas.width, canvas.height);

        // Draw label text
        context.font = 'bold 72px Arial';
        context.fillStyle = 'white';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(this.playerLabel, canvas.width / 2, canvas.height / 2);

        // Create sprite texture from canvas
        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
        this.labelMesh = new THREE.Sprite(spriteMaterial);
        
        // Position label above character
        this.labelMesh.scale.set(2, 1, 1);
        this.labelMesh.position.y = this.characterHeight + 1;
        
        // Add label to the model instead of the scene
        if (this.model) {
            this.model.add(this.labelMesh);
        }
    }

    jump() {
        if (!this.isJumping && !this.isFalling) {
            this.isJumping = true;
            this.isFalling = false;
            this.velocity.y = this.jumpSpeed;
            this.playAnimation('Run');
        }
    }

    update(deltaTime) {
        if (this.mixer) {
            this.mixer.update(deltaTime);
        }
        
        // Log periodic updates (every 100 frames or so to avoid console spam)
        if (Math.random() < 0.001) {
            console.log('Character state:', {
                position: this.getPosition(),
                animation: this.currentAnimation,
                visible: this.model?.visible,
                inScene: this.scene.children.includes(this.model)
            });
        }

        if (this.isJumping || this.isFalling) {
            // Apply gravity
            this.velocity.y += this.gravity * deltaTime;
            
            // Update position
            this.position.y += this.velocity.y * deltaTime;
            this.virtualPosition.y = this.position.y;

            // Check for landing
            if (this.position.y <= this.minHeight) {
                this.position.y = this.minHeight;
                this.virtualPosition.y = this.minHeight;
                this.velocity.y = 0;
                this.isJumping = false;
                this.isFalling = false;
                if (this.state !== 'Survey') {
                    this.playAnimation('Survey');
                }
            }
            else if (this.velocity.y < 0) {
                this.isJumping = false;
                this.isFalling = true;
            }
        }

        // Update model and placeholder positions
        if (this.model) {
            this.model.position.copy(this.position);
        }
        if (this.placeholder && this.placeholder.parent) {
            this.placeholder.position.copy(this.position);
        }

        // Update label position
    }

    async loadModel() {
        try {
            const loader = new GLTFLoader();
            
            const gltf = await loader.loadAsync(this.modelPath);
           
            
            this.model = gltf.scene;
            this.animations = gltf.animations;
            
            // Set up model properties
            this.model.scale.set(0.02, 0.02, 0.02);
            this.model.position.copy(this.placeholder.position);
            this.model.rotation.y = Math.PI;
            
            // Initialize animations
            this.mixer = new THREE.AnimationMixer(this.model);
            
            // Store all animations
            gltf.animations.forEach((clip) => {
                const action = this.mixer.clipAction(clip);
                this.animations[clip.name] = action;
                
                // Set default settings for all animations
                action.setEffectiveTimeScale(1.0);
                action.setEffectiveWeight(0);
            });

            // Make the model cast shadows and set up materials
            this.model.traverse((child) => {
                if (child.isMesh) {
                    
                    child.castShadow = true;
                    child.receiveShadow = true;
                    if (child.material) {
                        child.material.transparent = false;
                        child.material.opacity = 1.0;
                        child.material.side = THREE.DoubleSide;
                        child.material.needsUpdate = true;
                    }
                }
            });

            // Remove placeholder and add model
            if (this.placeholder && this.placeholder.parent) {
                this.scene.remove(this.placeholder);
            }
            this.scene.add(this.model);

            // Start with idle animation
            this.playAnimation('Survey');
            
            
            this.isLoaded = true;
            
            
            return this.model;
        } catch (error) {
            console.error('Error loading model:', error);
            throw error;
        }
    }

    initializeAnimations() {
        if (!this.model) {
            console.error('Cannot initialize animations: model not loaded');
            return;
        }

        // Create animation mixer
        this.mixer = new THREE.AnimationMixer(this.model);
        this.actions = {};
        
        // Get all animations from the model
        this.animations = this.model.animations;
        
        // Create actions for each animation
        this.animations.forEach(clip => {
            const action = this.mixer.clipAction(clip);
            this.actions[clip.name] = action;
            
            // Set default settings for each action
            action.setEffectiveTimeScale(1);
            action.setEffectiveWeight(0);
        });
        
        // Set up default animation
        if (this.actions['Survey']) {
            this.actions['Survey'].play();
            this.currentAction = this.actions['Survey'];
            this.currentAnimation = 'Survey';
        }
        
        
    }

    playAnimation(name, duration = 0.2, isOpponent = false) {
        if (!this.mixer || !this.animations[name]) {
            return;
        }

        // Don't restart the same animation
        if (this.currentAnimation === name) {
            return;
        }

        // Update state
        this.state = name;

        // Fade out current animation
        if (this.currentAction) {
            this.currentAction.fadeOut(duration);
        }

        // Start new animation
        const action = this.animations[name];
        if (action) {
    
            action.reset()
                .setEffectiveTimeScale(1.0)
                .setEffectiveWeight(1.0)
                .fadeIn(duration)
                .play();
            this.currentAction = action;
            this.currentAnimation = name;
        }
    }

    setPosition(x, y, z) {
        // Update internal position vector
        this.position.set(x, y, z);
        
        // Update model position if it exists
        if (this.model) {
            this.model.position.copy(this.position);
        }
        
        // Update placeholder position if it exists
        if (this.placeholder && this.placeholder.parent) {
            this.placeholder.position.copy(this.position);
        }
    }

    setVirtualPosition(x, y, z) {
        console.log('setting virtual position', z);
        this.virtualPosition.set(x, y, z);
    }

    getVirtualPosition() {
        return {
            x: this.virtualPosition.x,
            y: this.virtualPosition.y,
            z: this.virtualPosition.z
        };
    }

    getPosition() {
        return this.position;
    }

    dispose() {
        if (this.model) {
            // Remove label if it exists
            if (this.labelMesh) {
                this.model.remove(this.labelMesh);
                this.labelMesh.material.map.dispose();
                this.labelMesh.material.dispose();
            }
            
            // Remove model from scene
            this.scene.remove(this.model);
            
            // Dispose of model resources
            this.model.traverse((child) => {
                if (child.isMesh) {
                    child.geometry.dispose();
                    child.material.dispose();
                }
            });
        }

        if (this.placeholder && this.placeholder.parent) {
            this.scene.remove(this.placeholder);
            this.placeholder.geometry.dispose();
            this.placeholder.material.dispose();
        }

        if (this.mixer) {
            this.mixer.stopAllAction();
        }
    }

    reset() {
        // Reset position
        const characterStartHeight = 1 + this.characterHeight/2;  // roadOffset + characterHeight/2
        this.setPosition(0, characterStartHeight, 0);
        
        // Reset virtual position
        this.virtualPosition.set(0, characterStartHeight, 0);
        
        // Reset movement state
        this.isJumping = false;
        this.isFalling = false;
        this.velocity.set(0, 0, 0);
        
        // Reset animation
        if (this.mixer) {
            this.mixer.stopAllAction();
            this.playAnimation('Survey');
        }

        // Reset model rotation
        if (this.model) {
            this.model.rotation.y = Math.PI;  // Face forward
        }
    }
} 
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';

export class Character {
    constructor(scene, onLoaded) {
        this.scene = scene;
        this.mixer = null;
        this.model = null;
        this.animations = {};
        this.currentAction = null;
        this.state = 'idle';

        // Character properties
        this.position = new THREE.Vector3(0, 0, 0);
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.jumpSpeed = 10;
        this.gravity = -20;
        this.roadOffset = 1;
        this.characterHeight = 2;
        this.minHeight = this.roadOffset + 1;
        this.isJumping = false;
        this.isFalling = false;

        // Create temporary cube placeholder while model loads
        const geometry = new THREE.BoxGeometry(0.5, this.characterHeight, 0.5);
        const material = new THREE.MeshPhongMaterial({ color: 0x00ff00, transparent: true, opacity: 0.5 });
        this.placeholder = new THREE.Mesh(geometry, material);
        this.placeholder.castShadow = true;
        this.placeholder.position.y = this.minHeight;
        this.scene.add(this.placeholder);

        // Load character model and animations
        this.loadModel(onLoaded);
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
        // Update animation mixer
        if (this.mixer) {
            this.mixer.update(deltaTime);
        }

        if (this.isJumping || this.isFalling) {
            // Apply gravity
            this.velocity.y += this.gravity * deltaTime;
            
            // Update position
            this.position.y += this.velocity.y * deltaTime;

            // Check for landing
            if (this.position.y <= this.minHeight) {
                this.position.y = this.minHeight;
                this.velocity.y = 0;
                this.isJumping = false;
                this.isFalling = false;
                // Only change animation if we were in a different state
                if (this.state !== 'Survey') {
                    this.playAnimation('Survey');
                }
            }
            // Check for max height
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
    }

    loadModel(onLoaded) {
        const loader = new GLTFLoader();
        
        // Load the Fox model with animations
        loader.load('models/Fox/glTF/Fox.gltf', (gltf) => {
            this.model = gltf.scene;
            
            // Scale and position the model
            this.model.scale.set(0.02, 0.02, 0.02);
            this.model.position.copy(this.placeholder.position);
            this.model.rotation.y = Math.PI; // Face the camera
            
            // Setup animations
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
            this.scene.remove(this.placeholder);
            this.scene.add(this.model);

            // Start with idle animation
            this.playAnimation('Survey');
            if (onLoaded) onLoaded();
        });
    }

    playAnimation(name, duration = 0.2) {
        if (!this.mixer || !this.animations[name]) {
            return;
        }

        // Don't restart the same animation
        if (this.state === name) {
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
        }
    }

    setPosition(x, y, z) {
        this.position.set(x, y, z);
        if (this.model) {
            this.model.position.copy(this.position);
        }
        if (this.placeholder && this.placeholder.parent) {
            this.placeholder.position.copy(this.position);
        }
    }

    getPosition() {
        return this.position;
    }
} 
import * as THREE from 'three';

export class Obstacle {
    constructor(scene, settings) {
        this.scene = scene;
        this.settings = settings;
        
        // Create obstacle mesh
        const obstacleWidth = 1;  // Store width for positioning calculations
        const geometry = new THREE.BoxGeometry(obstacleWidth, 2, 1);
        const material = new THREE.MeshPhongMaterial({ color: 0xff0000 });
        this.mesh = new THREE.Mesh(geometry, material);
        
        // Set initial position using lane-based positioning
        const roadWidth = this.settings.game.roadWidth; // Total road width
        const laneWidth = roadWidth / 2; // Width of each lane
        const lane = Math.floor(Math.random() * 2); // 0 or 1
        
        // Calculate lane center positions:
        // For a road of width 20:
        // Left lane center should be at -10 (half of total road width from center)
        // Right lane center should be at +10 (half of total road width from center)
        console.log('lane', roadWidth);
        const xPos = lane === 0 ? -laneWidth/2 : laneWidth/2;
        
        const y = 1; // Height of obstacle
        const z = -this.settings.game.spawnDistance; // Use spawn distance from settings
        
        this.mesh.position.set(xPos, y, z);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        
        // Add to scene
        this.scene.add(this.mesh);

        // Create hitbox
        this.createHitbox();
    }

    update(deltaTime, speed) {
        // Move obstacle towards player
        this.mesh.position.z += speed;
        
        // Update hitbox position
        if (this.hitbox) {
            this.hitbox.position.copy(this.mesh.position);
        }
        
        // Return true if obstacle is past the player (for cleanup)
        return this.mesh.position.z > 5;
    }

    // Add collision detection methods
    getCollisionBox() {
        return new THREE.Box3().setFromObject(this.hitbox || this.mesh);
    }

    isBehindCamera() {
        return this.mesh.position.z > 10;
    }

    dispose() {
        if (this.mesh) {
            this.scene.remove(this.mesh);
            this.mesh.geometry.dispose();
            this.mesh.material.dispose();
        }
        if (this.hitbox) {
            this.scene.remove(this.hitbox);
            this.hitbox.geometry.dispose();
            this.hitbox.material.dispose();
        }
    }

    createHitbox() {
        // Create invisible hitbox for collision detection
        const hitboxGeometry = new THREE.BoxGeometry(1, 2, 1);
        const hitboxMaterial = new THREE.MeshBasicMaterial({
            visible: this.settings.debug?.showHitbox || false,
            wireframe: true,
            color: 0xff0000
        });
        this.hitbox = new THREE.Mesh(hitboxGeometry, hitboxMaterial);
        this.hitbox.position.copy(this.mesh.position);
        this.scene.add(this.hitbox);
    }
} 
import * as THREE from 'three';

export class Obstacle {
    constructor(scene, roadWidth, roadLength) {
        this.scene = scene;
        this.roadWidth = roadWidth;
        this.roadLength = roadLength;
        this.mesh = null;
        this.createObstacle();
    }

    createObstacle() {
        // Create a simple red box obstacle with brighter material
        // Make the box 5 times bigger (width=3.75 (half of 7.5), height=10, depth=5)
        const geometry = new THREE.BoxGeometry(3.75, 10, 5);
        const material = new THREE.MeshStandardMaterial({
            color: 0xff0000,
            emissive: 0xff0000,
            emissiveIntensity: 0.2,
            metalness: 0.3,
            roughness: 0.7
        });
        
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;

        // Add the mesh to the scene
        this.scene.add(this.mesh);

        this.position();

        return this.mesh;
    }

    position() {
        // Position the obstacle in one of two lanes
        const laneWidth = this.roadWidth / 2; // 2 lanes
        const lane = Math.floor(Math.random() * 2); // 0 or 1
        
        // Center the obstacle in the lane
        // For left lane: -laneWidth/2, for right lane: laneWidth/2
        const xPos = (lane - 0.5) * laneWidth;
        
        if (this.mesh) {
            // Position the obstacle at y=5 to make it stand on the ground (since height is now 10)
            // Use roadOffset (negative value) to place it further down the road
            this.mesh.position.set(xPos, 5, -this.roadLength * 0.3 );
        }
    }

    update(speed, deltaTime) {
        this.mesh.position.z += speed;
    }

    // Helper method to check if obstacle is behind camera
    isBehindCamera() {
        return this.mesh.position.z > 10;
    }

    // Helper method to get collision box
    getCollisionBox() {
        return new THREE.Box3().setFromObject(this.mesh);
    }

    // Clean up method
    dispose() {
        this.scene.remove(this.mesh);
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
    }
} 
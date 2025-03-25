import * as THREE from 'three';

export class Obstacle {
    constructor(scene, roadWidth, roadOffset) {
        this.scene = scene;
        this.roadWidth = roadWidth;
        this.roadOffset = roadOffset;
        this.mesh = this.createMesh();
        this.position = this.mesh.position;
    }

    createMesh() {
        // Create a simple red box obstacle with brighter material
        const geometry = new THREE.BoxGeometry(1, 2, 1);
        const material = new THREE.MeshStandardMaterial({
            color: 0xff0000,
            emissive: 0x330000,
            metalness: 0.1,
            roughness: 0.5
        });
        
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        // Position the obstacle in one of four lanes
        const laneWidth = this.roadWidth / 4; // 4 lanes
        const laneMultipliers = [-1.5, -0.5, 0.5, 1.5];
        const lane = laneMultipliers[Math.floor(Math.random() * laneMultipliers.length)];
        const xPos = lane * laneWidth;
        
        mesh.position.set(
            xPos,
            this.roadOffset + 1,
            -100
        );

        return mesh;
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
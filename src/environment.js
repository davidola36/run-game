import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';

export class Environment {
    constructor(scene) {
        this.scene = scene;
        this.trees = [];
        this.decorations = [];
        this.particleSystems = [];
        this.roadSegments = [];
        
        // Ground plane is 1000x1000, centered at origin
        this.groundSize = 1000;
        // Road should extend from near camera to horizon
        this.roadLength = this.groundSize;
        this.roadWidth = 20;
        this.segmentLength = 20;
        // Calculate number of segments needed to cover ground
        this.numSegments = Math.ceil(this.roadLength / this.segmentLength) + 2;
        
        // Environment properties
        this.timeOfDay = 0.5; // Start at noon
        this.dayDuration = 300; // 300 seconds = 5 minutes for a full day
        this.skyColors = {
            dawn: new THREE.Color(0xff9999),
            day: new THREE.Color(0x88ccff),
            dusk: new THREE.Color(0xff8c44),
            night: new THREE.Color(0x002244)
        };
        this.groundColor = 0x88cc66;
        this.roadColor = 0x666666;
        
        // Initialize environment
        this.initGround();
        this.createRoad();
        this.initLighting();
        this.initSky();
        this.initParticleSystems();
        this.createTrees();
        this.createBillboards();

        // Create time display
        this.createTimeDisplay();
    }

    createTimeDisplay() {
        // Create time display element
        this.timeDisplay = document.createElement('div');
        this.timeDisplay.style.cssText = `
            position: absolute;
            top: 60px;
            right: 20px;
            background: rgba(0, 0, 0, 0.5);
            color: white;
            padding: 10px;
            border-radius: 5px;
            font-family: Arial, sans-serif;
            font-size: 16px;
            z-index: 1000;
        `;
        document.getElementById('game-container').appendChild(this.timeDisplay);
    }

    initLighting() {
        // Add ambient light for consistent base lighting
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(this.ambientLight);

        // Add directional light for sun with increased intensity
        this.mainLight = new THREE.DirectionalLight(0xffffff, 1.0);
        this.mainLight.position.set(0, 100, -50);
        this.mainLight.castShadow = true;

        // Improve shadow quality
        this.mainLight.shadow.mapSize.width = 2048;
        this.mainLight.shadow.mapSize.height = 2048;
        this.mainLight.shadow.camera.near = 0.1;
        this.mainLight.shadow.camera.far = 200;
        this.mainLight.shadow.camera.left = -50;
        this.mainLight.shadow.camera.right = 50;
        this.mainLight.shadow.camera.top = 50;
        this.mainLight.shadow.camera.bottom = -50;
        this.mainLight.shadow.bias = -0.001;

        this.scene.add(this.mainLight);

        // Add hemisphere light for better ambient lighting
        this.hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.5);
        this.scene.add(this.hemisphereLight);
    }

    initGround() {
        // Create a procedural ground with slight variations
        const groundGeometry = new THREE.PlaneGeometry(1000, 1000, 100, 100);
        groundGeometry.rotateX(-Math.PI / 2);
        
        // Add some height variation
        const vertices = groundGeometry.attributes.position.array;
        for (let i = 0; i < vertices.length; i += 3) {
            vertices[i + 1] = Math.sin(vertices[i] / 20) * Math.cos(vertices[i + 2] / 20) * 0.5;
        }
        groundGeometry.computeVertexNormals();

        const groundMaterial = new THREE.MeshStandardMaterial({
            color: this.groundColor,
            metalness: 0,
            roughness: 0.8,
            envMapIntensity: 1.0,
            flatShading: false
        });

        this.ground = new THREE.Mesh(groundGeometry, groundMaterial);
        this.ground.position.y = 0; // Set ground at y=0
        this.ground.receiveShadow = true;
        this.scene.add(this.ground);
    }

    createRoad() {
        // Create road segments
        for (let i = 0; i < this.numSegments; i++) {
            const segment = this.createRoadSegment();
            
            // Start at z=0 and extend backwards towards horizon
            segment.position.z = (4 * this.segmentLength) - (i * this.segmentLength);
            
            this.roadSegments.push(segment);
            this.scene.add(segment);
        }
    }

    createLaneLine() {
        const lineGeometry = new THREE.PlaneGeometry(0.2, this.segmentLength);
        const lineMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            emissive: 0xffffff,
            emissiveIntensity: 0.5,
            metalness: 0.5,
            roughness: 0.3
        });
        const line = new THREE.Mesh(lineGeometry, lineMaterial);
        line.rotation.x = -Math.PI / 2;
        return line;
    }

    createRoadSegment() {
        // Create road base (darker, slightly lower than the road surface)
        const baseGeometry = new THREE.PlaneGeometry(this.roadWidth + 2, this.segmentLength);
        const baseMaterial = new THREE.MeshStandardMaterial({
            color: 0x444444,
            metalness: 0.5,
            roughness: 0.4,
            envMapIntensity: 1.0
        });
        const base = new THREE.Mesh(baseGeometry, baseMaterial);
        base.rotation.x = -Math.PI / 2;
        base.position.y = 0.99; // Just below road surface
        base.receiveShadow = true;

        // Create main road surface
        const roadGeometry = new THREE.PlaneGeometry(this.roadWidth, this.segmentLength);
        const roadMaterial = new THREE.MeshStandardMaterial({
            color: this.roadColor,
            metalness: 0.6,
            roughness: 0.3,
            envMapIntensity: 1.0
        });
        const road = new THREE.Mesh(roadGeometry, roadMaterial);
        road.rotation.x = -Math.PI / 2;
        road.position.y = 1; // Road at y=1
        road.receiveShadow = true;

        // Create a group to hold road and its markings
        const roadGroup = new THREE.Group();
        roadGroup.add(base);
        roadGroup.add(road);

        // Add lane markings with emissive material
        const markingsMaterial = new THREE.MeshStandardMaterial({ 
            color: 0xffffff,
            emissive: 0xffffff,
            emissiveIntensity: 0.5,
            metalness: 0.5,
            roughness: 0.3
        });
        
        // Center line
        const centerLine = new THREE.Mesh(
            new THREE.PlaneGeometry(0.25, this.segmentLength),
            markingsMaterial
        );
        centerLine.rotation.x = -Math.PI / 2;
        centerLine.position.y = 1.01; // Slightly above road
        roadGroup.add(centerLine);

        // Update lane line positions for two lanes
        const leftLine = this.createLaneLine();
        const rightLine = this.createLaneLine();
        
        // Position lines to create two lanes instead of four
        // No need for middle lines anymore as we only have one line in the center
        leftLine.position.x = 0;  // Center line
        leftLine.position.y = 1.02;
        leftLine.position.z = 0;
        
        rightLine.visible = false;  // Hide the second line since we only need one center line

        // Add shoulders (sides of the road)
        const shoulderGeometry = new THREE.BoxGeometry(1, 0.1, this.segmentLength);
        const shoulderMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x888888,
            metalness: 0.4,
            roughness: 0.6
        });
        
        const leftShoulder = new THREE.Mesh(shoulderGeometry, shoulderMaterial);
        const rightShoulder = new THREE.Mesh(shoulderGeometry, shoulderMaterial);
        
        leftShoulder.position.set(-this.roadWidth/2 - 0.5, 1.02, 0);
        rightShoulder.position.set(this.roadWidth/2 + 0.5, 1.02, 0);
        
        roadGroup.add(leftShoulder);
        roadGroup.add(rightShoulder);

        return roadGroup;
    }

    initSky() {
        // Remove existing sky elements if they exist
        if (this.sky) this.scene.remove(this.sky);
        if (this.celestialBody) this.scene.remove(this.celestialBody);
        if (this.sunGlow) this.scene.remove(this.sunGlow);

        // Create sky dome
        const skyGeometry = new THREE.SphereGeometry(500, 32, 32);
        const skyMaterial = new THREE.ShaderMaterial({
            uniforms: {
                topColor: { value: new THREE.Color(this.skyColors.day) },
                bottomColor: { value: new THREE.Color(this.skyColors.day).multiplyScalar(0.8) },
                offset: { value: 20 },
                exponent: { value: 0.6 }
            },
            vertexShader: `
                varying vec3 vWorldPosition;
                void main() {
                    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                    vWorldPosition = worldPosition.xyz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 topColor;
                uniform vec3 bottomColor;
                uniform float offset;
                uniform float exponent;
                varying vec3 vWorldPosition;
                void main() {
                    float h = normalize(vWorldPosition + offset).y;
                    gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
                }
            `,
            side: THREE.BackSide
        });

        this.sky = new THREE.Mesh(skyGeometry, skyMaterial);
        this.sky.position.z = -400;
        this.scene.add(this.sky);

        // Add sun
        const sunGeometry = new THREE.SphereGeometry(5, 32, 32);
        const sunMaterial = new THREE.MeshBasicMaterial({ 
            color: 0xffffcc,
            transparent: true,
            opacity: 0.8
        });
        this.celestialBody = new THREE.Mesh(sunGeometry, sunMaterial);
        this.celestialBody.position.set(0, 200, -300);
        this.scene.add(this.celestialBody);

        // Add sun glow
        const sunGlowGeometry = new THREE.SphereGeometry(8, 32, 32);
        const sunGlowMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffcc,
            transparent: true,
            opacity: 0.3
        });
        this.sunGlow = new THREE.Mesh(sunGlowGeometry, sunGlowMaterial);
        this.sunGlow.position.copy(this.celestialBody.position);
        this.scene.add(this.sunGlow);
    }

    updateSky(deltaTime) {
        // Update time of day
        this.timeOfDay = (this.timeOfDay + deltaTime / this.dayDuration) % 1;

        // Calculate sky colors based on time of day
        let topColor, bottomColor;
        const angle = this.timeOfDay * Math.PI * 2;

        if (this.timeOfDay < 0.25) { // Night to dawn
            topColor = this.skyColors.night.clone().lerp(this.skyColors.dawn, this.timeOfDay * 4);
        } else if (this.timeOfDay < 0.5) { // Dawn to day
            topColor = this.skyColors.dawn.clone().lerp(this.skyColors.day, (this.timeOfDay - 0.25) * 4);
        } else if (this.timeOfDay < 0.75) { // Day to dusk
            topColor = this.skyColors.day.clone().lerp(this.skyColors.dusk, (this.timeOfDay - 0.5) * 4);
        } else { // Dusk to night
            topColor = this.skyColors.dusk.clone().lerp(this.skyColors.night, (this.timeOfDay - 0.75) * 4);
        }

        bottomColor = topColor.clone().multiplyScalar(0.8);

        // Update sky material
        this.sky.material.uniforms.topColor.value = topColor;
        this.sky.material.uniforms.bottomColor.value = bottomColor;

        // Update sun position
        const radius = 400;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        
        this.celestialBody.position.set(x, y, -300);
        this.sunGlow.position.copy(this.celestialBody.position);

        // Update time display
        this.updateTimeDisplay();
    }

    updateTimeDisplay() {
        // Convert timeOfDay (0-1) to hours and minutes (24-hour format)
        const totalHours = this.timeOfDay * 24;
        const hours = Math.floor(totalHours);
        const minutes = Math.floor((totalHours - hours) * 60);
        
        // Format time as HH:MM
        const timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
        this.timeDisplay.textContent = `Time: ${timeString}`;
    }

    initParticleSystems() {
        // Create magical particle effects
        const particleGeometry = new THREE.BufferGeometry();
        const particleCount = 1000;
        const positions = new Float32Array(particleCount * 3);
        const colors = new Float32Array(particleCount * 3);

        for (let i = 0; i < particleCount; i++) {
            positions[i * 3] = (Math.random() - 0.5) * 100;
            positions[i * 3 + 1] = Math.random() * 50;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 100;

            colors[i * 3] = Math.random();
            colors[i * 3 + 1] = Math.random();
            colors[i * 3 + 2] = Math.random();
        }

        particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const particleMaterial = new THREE.PointsMaterial({
            size: 0.1,
            vertexColors: true,
            transparent: true,
            opacity: 0.6
        });

        this.particleSystem = new THREE.Points(particleGeometry, particleMaterial);
        this.scene.add(this.particleSystem);
    }

    createBillboards() {
        // Create billboards on both sides of the road
        const billboardGeometry = new THREE.BoxGeometry(15, 8, 0.5);
        const billboardMaterial = new THREE.MeshStandardMaterial({ 
            color: 0xcccccc,
            metalness: 0.2,
            roughness: 0.8
        });
        
        // Make posts slimmer (reduced width from 0.5 to 0.3)
        const postGeometry = new THREE.BoxGeometry(0.3, 6, 0.3);
        const postMaterial = new THREE.MeshStandardMaterial({
            color: 0x666666,
            metalness: 0.3,
            roughness: 0.7
        });

        // Create billboards along the road
        for (let i = 0; i < 10; i++) {
            const billboard = new THREE.Group();
            
            // Create the board
            const board = new THREE.Mesh(billboardGeometry, billboardMaterial);
            board.position.y = 8; // Height of the billboard
            board.position.z = 0; // Ensure board is at z=0
            board.castShadow = true;
            board.receiveShadow = true;
            
            // Create two support posts - position them slightly behind the board
            const leftPost = new THREE.Mesh(postGeometry, postMaterial);
            const rightPost = new THREE.Mesh(postGeometry, postMaterial);
            
            leftPost.position.set(-6, 3, 0.1);  // Move posts slightly behind board
            rightPost.position.set(6, 3, 0.1);  // Move posts slightly behind board
            
            leftPost.castShadow = true;
            rightPost.castShadow = true;
            
            billboard.add(board);
            billboard.add(leftPost);
            billboard.add(rightPost);
            
            // Position the billboard
            const z = -50 - (i * 100);
            const side = i % 2 === 0 ? 1 : -1;
            const x = (this.roadWidth/2 + 15) * side;
            
            billboard.position.set(x, 0, z);
            
            this.scene.add(billboard);
            this.decorations.push(billboard);
        }
    }

    createTrees() {
        // Create tree trunk geometry and material
        const trunkGeometry = new THREE.CylinderGeometry(0.3, 0.5, 2, 8);
        const trunkMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x4a2f1b,
            metalness: 0.1,
            roughness: 0.8
        });

        // Create tree top geometry and material
        const topGeometry = new THREE.ConeGeometry(2, 4, 8);
        const topMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x0a5c0a,
            metalness: 0,
            roughness: 0.9
        });
        
        // Create trees on both sides of the road with more spread
        // Increased number of trees and spread them out more
        for (let i = 0; i < 300; i++) {
            const treeGroup = new THREE.Group();
            
            // Create trunk and top
            const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
            const top = new THREE.Mesh(topGeometry, topMaterial);
            
            // Position the top above the trunk
            trunk.position.y = 1;
            top.position.y = 4;
            
            // Add shadows
            trunk.castShadow = true;
            top.castShadow = true;
            trunk.receiveShadow = true;
            top.receiveShadow = true;
            
            // Randomly scale trees for variety
            const scale = 0.5 + Math.random() * 1.5;
            treeGroup.scale.set(scale, scale, scale);
            
            treeGroup.add(trunk);
            treeGroup.add(top);
            
            // Random position along the road
            const z = -Math.random() * this.roadLength;
            
            // Random position on either side of the road with greater spread
            const side = Math.random() < 0.5 ? -1 : 1;
            // Increased spread range from road (5-100 units instead of 5-20)
            const x = (this.roadWidth/2 + 5 + Math.random() * 95) * side;
            
            treeGroup.position.set(x, 0, z);
            
            // Random rotation for variety
            treeGroup.rotation.y = Math.random() * Math.PI * 2;
            
            this.scene.add(treeGroup);
            this.trees.push(treeGroup);
        }
    }

    update(deltaTime, speed) {
        // Only update positions if there's movement
        if (speed > 0) {
            // Update road segments
            this.updateRoad(deltaTime, speed);
            
            // Update decorations positions (trees and billboards)
            this.updateDecorations(speed);

            // Remove ground movement
            // this.ground.position.z += speed;
            // if (this.ground.position.z > 500) {
            //     this.ground.position.z -= 1000;
            // }
        }
        
        // Update sky (time of day)
        this.updateSky(deltaTime);
        
        // Update particle systems
        this.updateParticleSystems(deltaTime);
    }

    updateRoad(deltaTime, speed) {
        // Move road segments
        for (let i = 0; i < this.roadSegments.length; i++) {
            const segment = this.roadSegments[i];
            segment.position.z += speed;
        }

        // Sort segments by Z position for proper recycling (front to back)
        this.roadSegments.sort((a, b) => b.position.z - a.position.z);

        // Recycle segments that are too far behind camera
        while (this.roadSegments[0] && this.roadSegments[0].position.z > 5) {
            // Get the last segment (furthest back)
            const lastSegment = this.roadSegments[this.roadSegments.length - 1];
            
            // Calculate where the new segment should go
            const newZ = lastSegment.position.z - this.segmentLength;
            
            // Only recycle if we're not past the ground plane
            if (newZ >= -this.groundSize/2) {
                const recycledSegment = this.roadSegments.shift();
                recycledSegment.position.z = newZ;
                this.roadSegments.push(recycledSegment);
            } else {
                break;
            }
        }
    }

    updateParticleSystems(deltaTime) {
        this.particleSystems.forEach(system => {
            system.update(deltaTime);
        });
    }

    updateDecorations(speed) {
        // Update trees and billboards
        [...this.trees, ...this.decorations].forEach(decoration => {
            decoration.position.z += speed;
            
            // If decoration goes behind camera, move it back to the horizon
            if (decoration.position.z > 30) {
                // Move further back and randomize x position for trees
                if (this.trees.includes(decoration)) {
                    const side = Math.random() < 0.5 ? -1 : 1;
                    decoration.position.x = (this.roadWidth/2 + 5 + Math.random() * 95) * side;
                    decoration.rotation.y = Math.random() * Math.PI * 2; // Random rotation when recycled
                }
                decoration.position.z -= this.roadLength + 60;
            }
        });
    }
} 
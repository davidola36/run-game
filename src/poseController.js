import * as poseDetection from '@tensorflow-models/pose-detection';
import '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgl';

export class PoseController {
    constructor(onControlsUpdate, gui = null) {
        this.detector = null;
        this.videoElement = null;
        this.baselinePositions = null;
        this.isCalibrated = false;
        this.isActive = false;
        this.detectionInterval = null;
        this.onControlsUpdate = onControlsUpdate;
        this.videoContainer = null;
        this.movementLabel = null;
        this.canvas = null;
        this.ctx = null;
        this.baselineKeypoints = null;
        this.lastUpdateTime = 0;
        this.movementThreshold = 50;
        this.gui = gui;
        
        // Add walking state management
        this.isWalking = false;
        this.lastWalkingTime = 0;
        this.walkingStopDelay = 2000; // 2 seconds delay before stopping

        // Movement configuration with default thresholds
        this.MOVEMENT_CONFIG = {
            lateral_threshold: 0.1,    // Threshold for left/right movement
            jump_threshold: 0.15,      // Threshold for jump detection
            duck_threshold: 0.2,       // Threshold for duck detection
            walk_threshold: 0.01        // Threshold for walk detection
        };

        this.setupControls();
    }

    async initialize() {
        try {
            // Create container for video and canvas
            this.videoContainer = document.createElement('div');
            this.videoContainer.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                width: 25vw;
                aspect-ratio: 3/4;
                border-radius: 8px;
                border: 2px solid white;
                background-color: rgba(0, 0, 0, 0.5);
                z-index: 1000;
                overflow: hidden;
                display: none; // Start hidden by default
            `;
            document.body.appendChild(this.videoContainer);

            // Initialize video element
            this.videoElement = document.createElement('video');
            this.videoElement.setAttribute('playsinline', true);
            this.videoElement.setAttribute('autoplay', true);
            this.videoElement.setAttribute('muted', true);
            this.videoElement.muted = true;
            this.videoElement.style.cssText = `
                width: 100%;
                height: 100%;
                transform: scaleX(-1);
                object-fit: cover;
            `;
            this.videoContainer.appendChild(this.videoElement);

            // Initialize canvas with matching dimensions
            this.canvas = document.createElement('canvas');
            this.canvas.style.cssText = `
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                transform: scaleX(-1);
                pointer-events: none;
            `;
            this.videoContainer.appendChild(this.canvas);
            
            // Set initial canvas dimensions
            this.canvas.width = 320;
            this.canvas.height = 240;
            this.ctx = this.canvas.getContext('2d');

            // Initialize movement label
            this.movementLabel = document.createElement('div');
            this.movementLabel.style.cssText = `
                position: fixed;
                top: calc(20px + 25vw * 4/3);
                right: 20px;
                width: 25vw;
                padding: 8px;
                background-color: rgba(0, 0, 0, 0.7);
                color: white;
                font-family: Arial, sans-serif;
                font-size: 14px;
                text-align: center;
                border-radius: 0 0 8px 8px;
                z-index: 1000;
                display: none; // Start hidden by default
            `;
            document.body.appendChild(this.movementLabel);

            // Initialize MoveNet
            this.detector = await poseDetection.createDetector(
                poseDetection.SupportedModels.MoveNet,
                {
                    modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
                    enableSmoothing: true,
                    minPoseScore: 0.3
                }
            );

            // this.setupControls();

            console.log('PoseController initialized successfully');
            return true;
        } catch (error) {
            console.error('Error initializing pose controller:', error);
            return false;
        }
    }

    setupControls() {
        // Only proceed if we have a GUI instance
        if (!this.gui) {
            console.warn('No GUI instance provided to PoseController');
            return;
        }

        // Get Controls folder directly from the __folders Map
        const controlsFolder = this.gui.__folders['Controls'];
        
        if (!controlsFolder) {
            console.warn('Controls folder not found in GUI');
            return;
        }

        // Add new Movement Thresholds folder
        const thresholdsFolder = controlsFolder.addFolder('Movement Thresholds');
        
        // Add threshold controls
        thresholdsFolder.add(this.MOVEMENT_CONFIG, 'lateral_threshold', 0.001, 0.1)
            .name('Left/Right Threshold')
            .onChange(() => {
                if (this.isCalibrated) {
                    this.calibrate();
                }
            });

        thresholdsFolder.add(this.MOVEMENT_CONFIG, 'jump_threshold', 0.1, 0.5)
            .name('Jump Threshold')
            .onChange(() => {
                if (this.isCalibrated) {
                    this.calibrate();
                }
            });

        thresholdsFolder.add(this.MOVEMENT_CONFIG, 'duck_threshold', 0.1, 0.5)
            .name('Duck Threshold')
            .onChange(() => {
                if (this.isCalibrated) {
                    this.calibrate();
                }
            });

        thresholdsFolder.add(this.MOVEMENT_CONFIG, 'walk_threshold', 0.001, 0.1)
            .name('Walk Threshold')
            .onChange(() => {
                if (this.isCalibrated) {
                    this.calibrate();
                }
            });

        // Open the folder by default
        thresholdsFolder.open();
    }

    async detectPose() {
        try {
            if (!this.videoElement) {
                console.error('Video element not initialized');
                return null;
            }
            
            if (this.videoElement.videoWidth === 0 || this.videoElement.videoHeight === 0) {
                console.error('Video dimensions not ready:', JSON.stringify({
                    width: this.videoElement.videoWidth,
                    height: this.videoElement.videoHeight
                }));
                return null;
            }
            
            if (this.videoElement.paused || this.videoElement.ended) {
                console.error('Video not playing:', {
                    paused: this.videoElement.paused,
                    ended: this.videoElement.ended,
                    readyState: this.videoElement.readyState
                });
                return null;
            }

            const poses = await this.detector.estimatePoses(this.videoElement, {
                flipHorizontal: false
            });
            
            if (poses.length === 0) {
                this.movementLabel.textContent = 'No person detected - Please stand in frame';
                this.movementLabel.style.backgroundColor = 'rgba(255, 0, 0, 0.3)';
                return null;
            }

            const pose = poses[0]; // MoveNet returns an array of poses
            
            // Lower the threshold for visibility and count key points
            const visibleKeypoints = pose.keypoints.filter(point => point.score > 0.2);
            const visibilityRatio = visibleKeypoints.length / pose.keypoints.length;

            // Log pose detection details for debugging
      

            // Update movement label with more detailed detection status
            if (visibilityRatio > 0) {
                if (visibilityRatio > 0.5) {
                    this.movementLabel.textContent = 'Person detected - Ready for controls';
                    this.movementLabel.style.backgroundColor = 'rgba(0, 255, 0, 0.3)';
                } else {
                    this.movementLabel.textContent = `Partial detection (${Math.round(visibilityRatio * 100)}%) - Move back or adjust position`;
                    this.movementLabel.style.backgroundColor = 'rgba(255, 165, 0, 0.3)';
                }
                // Draw bounding box even with partial detection
                this.drawBoundingBox(pose);
                return pose;
            }

            this.movementLabel.textContent = 'Move back until your full body is visible';
            this.movementLabel.style.backgroundColor = 'rgba(255, 0, 0, 0.3)';
            return null;
        } catch (error) {
            console.error('Error detecting pose:', error);
            return null;
        }
    }

    drawBoundingBox(pose) {
        if (!this.canvas || !this.ctx || !this.videoElement) {
            console.error('Missing required elements for drawing');
            return;
        }

        // Get the actual display size
        const rect = this.videoContainer.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;

        // Clear previous drawing
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Calculate bounding box
        const keypoints = pose.keypoints;
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;

        // Count visible keypoints with lower threshold
        const visibleKeypoints = keypoints.filter(point => point.score > 0.2);
        const visibilityRatio = visibleKeypoints.length / keypoints.length;

        // Draw even with fewer visible keypoints
        if (visibilityRatio > 0.2) {
            // Calculate bounding box from visible keypoints
            visibleKeypoints.forEach(point => {
                minX = Math.min(minX, point.x);
                minY = Math.min(minY, point.y);
                maxX = Math.max(maxX, point.x);
                maxY = Math.max(maxY, point.y);
            });

            // Check if we have valid bounds
            if (minX === Infinity || minY === Infinity || maxX === -Infinity || maxY === -Infinity) {
                return;
            }

            // Add padding to the bounding box
            const padding = 20;
            minX = Math.max(0, minX - padding);
            minY = Math.max(0, minY - padding);
            maxX = Math.min(this.videoElement.videoWidth, maxX + padding);
            maxY = Math.min(this.videoElement.videoHeight, maxY + padding);

            // Calculate scaling factors
            const scaleX = this.canvas.width / this.videoElement.videoWidth;
            const scaleY = this.canvas.height / this.videoElement.videoHeight;

            // Draw bounding box with color based on visibility
            this.ctx.strokeStyle = visibilityRatio > 0.5 ? '#00ff00' : '#ffa500';
            this.ctx.lineWidth = 3;
            this.ctx.beginPath();
            this.ctx.rect(
                minX * scaleX,
                minY * scaleY,
                (maxX - minX) * scaleX,
                (maxY - minY) * scaleY
            );
            this.ctx.stroke();

            // Draw keypoints
            this.ctx.fillStyle = '#ff0000';
            visibleKeypoints.forEach(point => {
                this.ctx.beginPath();
                this.ctx.arc(
                    point.x * scaleX,
                    point.y * scaleY,
                    4,
                    0,
                    2 * Math.PI
                );
                this.ctx.fill();
            });
        }
    }

    detectWalking(pose) {
        // Use knee positions for walking detection
        const leftKnee = pose.keypoints[13];
        const rightKnee = pose.keypoints[14];
        
        // Check if both knees are detected with good confidence
        if (leftKnee.score > 0.3 && rightKnee.score > 0.3 && this.videoElement) {
            // Use actual video dimensions
            const videoWidth = this.videoElement.videoWidth;
            const videoHeight = this.videoElement.videoHeight;

            if (videoWidth === 0 || videoHeight === 0) {
                return false;
            }

            // Calculate vertical distance between knees
            const kneeDistance = Math.abs(leftKnee.y - rightKnee.y);
            
            // Calculate horizontal movement of knees
            const kneeHorizontalDiff = Math.abs(leftKnee.x - rightKnee.x);
            
            // Walking is detected when knees have significant vertical separation
            // and are also somewhat separated horizontally
            const verticalThreshold = this.MOVEMENT_CONFIG.walk_threshold * videoHeight;
            const horizontalThreshold = this.MOVEMENT_CONFIG.walk_threshold * videoWidth * 0.5;
            
            const currentWalkingState = kneeDistance > verticalThreshold && kneeHorizontalDiff > horizontalThreshold;
            
            // Update walking state management
            const currentTime = Date.now();
            if (currentWalkingState) {
                this.isWalking = true;
                this.lastWalkingTime = currentTime;
            } else if (this.isWalking && (currentTime - this.lastWalkingTime > this.walkingStopDelay)) {
                this.isWalking = false;
            }
            
            return this.isWalking;
        }
        return false;
    }

    async detectMovement() {
        if (!this.isCalibrated || !this.videoElement) return null;

        // Check if video dimensions are valid
        if (this.videoElement.videoWidth === 0 || this.videoElement.videoHeight === 0) {
            console.warn('Video dimensions not yet available');
            return null;
        }

        const pose = await this.detectPose();
        if (!pose) return null;

        // Calculate current positions
        const leftShoulder = pose.keypoints[5];
        const rightShoulder = pose.keypoints[6];
        const leftHip = pose.keypoints[11];
        const rightHip = pose.keypoints[12];
        const nose = pose.keypoints[0];

        // Ensure all required keypoints have good confidence
        if (leftShoulder.score < 0.3 || rightShoulder.score < 0.3 || 
            leftHip.score < 0.3 || rightHip.score < 0.3 || nose.score < 0.3) {
            return null;
        }

        const currentShoulders = {
            x: (leftShoulder.x + rightShoulder.x) / 2,
            y: (leftShoulder.y + rightShoulder.y) / 2
        };

        const currentHips = {
            y: (leftHip.y + rightHip.y) / 2
        };

        const currentHead = {
            y: nose.y
        };

        // Use actual video dimensions for threshold calculations
        const videoWidth = this.videoElement.videoWidth;
        const videoHeight = this.videoElement.videoHeight;

        // Detect movements using actual video dimensions
        const movements = {
            left: (currentShoulders.x - this.baselinePositions.shoulders.x) > this.MOVEMENT_CONFIG.lateral_threshold * videoWidth,
            right: (this.baselinePositions.shoulders.x - currentShoulders.x) > this.MOVEMENT_CONFIG.lateral_threshold * videoWidth,
            jump: (this.baselinePositions.head.y - currentHead.y) > this.MOVEMENT_CONFIG.jump_threshold * videoHeight,
            duck: (currentHips.y - this.baselinePositions.hips.y) > this.MOVEMENT_CONFIG.duck_threshold * videoHeight,
            walking: this.detectWalking(pose)
        };

        // If any non-walking movement is detected, update the baseline positions
        if (movements.left || movements.right || movements.jump || movements.duck) {
            // Add a small delay before updating baseline to prevent rapid triggering
            if (Date.now() - this.lastUpdateTime > 500) { // 500ms cooldown
                this.baselinePositions = {
                    shoulders: currentShoulders,
                    hips: currentHips,
                    head: currentHead
                };
                this.lastUpdateTime = Date.now();
            }
        }

        return movements;
    }

    calibrate() {
        return new Promise(async (resolve) => {
            const pose = await this.detectPose();
            if (!pose) {
                this.movementLabel.textContent = 'Calibration failed - No pose detected';
                this.movementLabel.style.backgroundColor = 'rgba(255, 0, 0, 0.3)';
                resolve(false);
                return;
            }

            // Get required keypoints
            const leftShoulder = pose.keypoints[5];
            const rightShoulder = pose.keypoints[6];
            const leftHip = pose.keypoints[11];
            const rightHip = pose.keypoints[12];
            const nose = pose.keypoints[0];

            // Check if all required keypoints are detected with good confidence
            const requiredKeypoints = [leftShoulder, rightShoulder, leftHip, rightHip, nose];
            const allKeypointsVisible = requiredKeypoints.every(point => point.score > 0.3);

            if (!allKeypointsVisible) {
                this.movementLabel.textContent = 'Calibration failed - Please face the camera and ensure your full body is visible';
                this.movementLabel.style.backgroundColor = 'rgba(255, 0, 0, 0.3)';
                resolve(false);
                return;
            }

            // Set baseline positions only if all keypoints are visible
            this.baselinePositions = {
                shoulders: {
                    x: (leftShoulder.x + rightShoulder.x) / 2,
                    y: (leftShoulder.y + rightShoulder.y) / 2
                },
                hips: {
                    y: (leftHip.y + rightHip.y) / 2
                },
                head: {
                    y: nose.y
                }
            };

            console.log('Calibration successful with positions:', {
                shoulders: this.baselinePositions.shoulders,
                hips: this.baselinePositions.hips,
                head: this.baselinePositions.head
            });

            this.isCalibrated = true;
            this.movementLabel.textContent = 'Calibration successful - Ready for controls';
            this.movementLabel.style.backgroundColor = 'rgba(0, 255, 0, 0.3)';
            resolve(true);
        });
    }

    async start() {
        if (this.isActive) return;
        
        try {
            // Show the video container and movement label
            if (this.videoContainer) {
                this.videoContainer.style.display = 'block';
            }
            if (this.movementLabel) {
                this.movementLabel.style.display = 'block';
            }

            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: {
                    width: { ideal: 320, min: 320 },
                    height: { ideal: 240, min: 240 },
                    facingMode: 'user',
                    frameRate: { ideal: 30 }
                }
            });
            
            this.videoElement.srcObject = stream;
            
            // Wait for video to be fully loaded before proceeding
            await new Promise((resolve, reject) => {
                let timeoutId;
                
                const checkDimensions = () => {
                    if (this.videoElement.videoWidth > 0 && this.videoElement.videoHeight > 0) {
                        clearTimeout(timeoutId);
                        console.log('Video dimensions ready:', {
                            width: this.videoElement.videoWidth,
                            height: this.videoElement.videoHeight
                        });
                        resolve();
                    }
                };

                this.videoElement.onloadedmetadata = () => {
                    this.videoElement.onloadeddata = async () => {
                        try {
                            await this.videoElement.play();
                            // Check dimensions immediately after play
                            checkDimensions();
                            
                            // Also set up an interval to check dimensions
                            const dimensionCheckInterval = setInterval(() => {
                                if (this.videoElement.videoWidth > 0 && this.videoElement.videoHeight > 0) {
                                    clearInterval(dimensionCheckInterval);
                                    console.log('Video dimensions confirmed:', JSON.stringify({
                                        width: this.videoElement.videoWidth,
                                        height: this.videoElement.videoHeight,
                                        readyState: this.videoElement.readyState
                                    }));
                                    resolve();
                                }
                            }, 100);

                            // Set a timeout to abort if dimensions never become available
                            timeoutId = setTimeout(() => {
                                clearInterval(dimensionCheckInterval);
                                reject(new Error('Timeout waiting for video dimensions'));
                            }, 10000);
                        } catch (error) {
                            reject(error);
                        }
                    };
                };
                
                this.videoElement.onerror = (error) => reject(new Error(`Video error: ${error}`));
            });

            // Once video is ready, start detection
            this.isActive = true;
            this.videoElement.style.display = 'block';
            this.canvas.style.display = 'block';
            
            // Attempt initial calibration
            console.log('Attempting initial calibration...');
            const calibrated = await this.calibrate();
            if (calibrated) {
                console.log('Initial calibration successful');
                this.startDetectionLoop();
            } else {
                console.warn('Initial calibration failed, will try again in detection loop');
                this.startDetectionLoop();
            }
            
            console.log('Pose detection started successfully');
        } catch (error) {
            console.error('Error starting pose detection:', error);
            this.isActive = false;
            throw error; // Propagate error up
        }
    }

    startDetectionLoop() {
        if (this.detectionInterval) {
            clearInterval(this.detectionInterval);
        }
        
        if (this.videoContainer) {
            this.videoContainer.style.display = 'block';
        }
        
        console.log('Starting detection loop');
        this.detectionInterval = setInterval(async () => {
            if (!this.isActive) {
                console.log('Detection loop stopped - controller not active');
                return;
            }
            
            if (this.videoContainer && this.videoContainer.style.display !== 'block') {
                this.videoContainer.style.display = 'block';
            }
            
            // Try to calibrate if not calibrated
            if (!this.isCalibrated) {
                const calibrated = await this.calibrate();
                if (!calibrated) {
                    return; // Skip movement detection if calibration fails
                }
            }
            
            const movements = await this.detectMovement();
            if (movements) {
                const activeMovements = [];
                if (movements.left) activeMovements.push('Left');
                if (movements.right) activeMovements.push('Right');
                if (movements.jump) activeMovements.push('Jump');
                if (movements.duck) activeMovements.push('Duck');
                if (movements.walking) activeMovements.push('Walking');
                
                this.movementLabel.textContent = activeMovements.length > 0 
                    ? activeMovements.join(', ')
                    : 'Standing still';
                
                if (this.onControlsUpdate) {
                    this.onControlsUpdate(movements);
                }
            }
        }, 1000/30); // 30fps detection rate
    }

    stop() {
        console.log('Stopping pose controller');
        this.isActive = false;
        
        // Hide the video container and movement label
        if (this.videoContainer) {
            this.videoContainer.style.display = 'none';
        }
        if (this.movementLabel) {
            this.movementLabel.style.display = 'none';
        }
        
        if (this.detectionInterval) {
            clearInterval(this.detectionInterval);
            this.detectionInterval = null;
        }
        
        // Stop the video stream
        if (this.videoElement && this.videoElement.srcObject) {
            const tracks = this.videoElement.srcObject.getTracks();
            tracks.forEach(track => track.stop());
        }
    }

    cleanup() {
        this.stop();
        if (this.videoElement && this.videoElement.srcObject) {
            const tracks = this.videoElement.srcObject.getTracks();
            tracks.forEach(track => track.stop());
            this.videoElement.srcObject = null;
            this.videoContainer.remove();
        }
    }
} 
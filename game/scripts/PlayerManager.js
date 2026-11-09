globalThis.PlayerManager = {
    keys: new Set(),
    velocityY: 0,
    velocityX: 0,
    onGround: false,
    speed: 600,
    acceleration: 4000,
    friction: 5000,
    airResistance: 2000,
    jumpForce: 950,
    gravity: 2400,
    coyoteTimeDuration: 0.1,
    coyoteTimer: 0,
    jumpBufferDuration: 0.12,
    jumpBufferTimer: 0,
    lastStandingBox: null,

    reset() {
        this.keys.clear();
        this.velocityY = 0;
        this.velocityX = 0;
        this.onGround = false;
        this.coyoteTimer = 0;
        this.jumpBufferTimer = 0;
        this.lastStandingBox = null;
    },

    initialize(runtime) {
        this.keys.clear();
        runtime.addEventListener("keydown", e => {
            this.keys.add(e.code.toLowerCase());
            this.keys.add(e.key.toLowerCase());
        });
        runtime.addEventListener("keyup", e => {
            this.keys.delete(e.code.toLowerCase());
            this.keys.delete(e.key.toLowerCase());
        });
        runtime.addEventListener("layoutstart", () => {
            this.reset();
        });
    },

    updateHorizontalVelocity(deltaTime) {
        let velocityX = 0;
        if (this.keys.has("keya") || this.keys.has("arrowleft")) {
            velocityX -= this.speed;
        }
        if (this.keys.has("keyd") || this.keys.has("arrowright")) {
            velocityX += this.speed;
        }

        const currentFriction = velocityX === 0 ? (this.onGround ? this.friction : this.airResistance) : this.acceleration;

        if (this.velocityX < velocityX) {
            this.velocityX = Math.min(this.velocityX + currentFriction * deltaTime, velocityX);
        } else if (this.velocityX > velocityX) {
            this.velocityX = Math.max(this.velocityX - currentFriction * deltaTime, velocityX);
        }

        return this.velocityX * deltaTime;
    },

    handleJump(player, boxes, solidObstacles, deltaTime) {
        const jumpPressed = this.keys.has("space") || this.keys.has("keyw") || this.keys.has("arrowup");

        if (this.onGround) {
            this.coyoteTimer = this.coyoteTimeDuration;
        } else {
            this.coyoteTimer = Math.max(0, this.coyoteTimer - deltaTime);
        }

        if (jumpPressed && this.coyoteTimer > 0) {
            const playerBox = player.getBoundingBox();
            for (const obstacle of solidObstacles) {
                if (!boxes.includes(obstacle)) continue;
                const obstacleBox = obstacle.getBoundingBox();
                
                const isStanding = playerBox.bottom >= obstacleBox.top - 2 && 
                                   playerBox.bottom <= obstacleBox.top + 15 && 
                                   playerBox.right > obstacleBox.left && 
                                   playerBox.left < obstacleBox.right;

                if (isStanding) {
                    globalThis.BoxManager.lockAfterJump(obstacle);
                    this.lastStandingBox = null;
                    break;
                }
            }
            this.velocityY = -this.jumpForce;
            this.onGround = false;
            this.coyoteTimer = 0;
            return true;
        }
        return false;
    },

    resolveCollisions(player, solidObstacles, boxes) {
        this.onGround = false;
        let currentStandingBox = null;
        
        for (let iteration = 0; iteration < 3; iteration++) {
            let playerBox = player.getBoundingBox();
            let deepestObstacle = null;
            let minOverlapX = Infinity;
            let minOverlapY = Infinity;
            let pushDirectionX = 0;
            let pushDirectionY = 0;

            for (const obstacle of solidObstacles) {
                const obstacleBox = obstacle.getBoundingBox();
                
                const overlaps = playerBox.right > obstacleBox.left && 
                                 playerBox.left < obstacleBox.right && 
                                 playerBox.bottom > obstacleBox.top && 
                                 playerBox.top < obstacleBox.bottom;
                
                if (!overlaps) continue;

                const overlapX1 = playerBox.right - obstacleBox.left;
                const overlapX2 = obstacleBox.right - playerBox.left;
                const overlapY1 = playerBox.bottom - obstacleBox.top;
                const overlapY2 = obstacleBox.bottom - playerBox.top;

                const overlapX = Math.min(overlapX1, overlapX2);
                const overlapY = Math.min(overlapY1, overlapY2);

                if (overlapX < overlapY) {
                    if (overlapX < minOverlapX) {
                        minOverlapX = overlapX;
                        pushDirectionX = overlapX1 < overlapX2 ? -overlapX1 : overlapX2;
                        pushDirectionY = 0;
                        deepestObstacle = obstacle;
                    }
                } else {
                    if (overlapY < minOverlapY) {
                        minOverlapY = overlapY;
                        pushDirectionX = 0;
                        pushDirectionY = overlapY1 < overlapY2 ? -overlapY1 : overlapY2;
                        deepestObstacle = obstacle;
                    }
                }
            }

            if (!deepestObstacle) break;

            if (pushDirectionX !== 0) {
                player.x += pushDirectionX;
                this.velocityX = 0;
            }
            if (pushDirectionY !== 0) {
                player.y += pushDirectionY;
                
                if (pushDirectionY < 0) {
                    this.onGround = true;
                    this.velocityY = 0;
                    if (boxes.includes(deepestObstacle)) {
                        currentStandingBox = deepestObstacle;
                        if (globalThis.BoxManager && typeof globalThis.BoxManager.enableOrDisableDragging === "function") {
                            globalThis.BoxManager.enableOrDisableDragging(deepestObstacle, false);
                        }
                    }
                } else if (pushDirectionY > 0) {
                    if (this.velocityY < 0) this.velocityY = 0;
                }
            }
        }

        if (this.lastStandingBox && this.lastStandingBox !== currentStandingBox) {
            if (globalThis.BoxManager && typeof globalThis.BoxManager.lockAfterJump === "function") {
                globalThis.BoxManager.lockAfterJump(this.lastStandingBox);
            }
        }
        this.lastStandingBox = currentStandingBox;
    },

    update(player, grounds, boxes, deltaTime) {
        const dt = Math.min(deltaTime, 0.1);
        const solidObstacles = [...grounds, ...boxes];

        const movementX = this.updateHorizontalVelocity(dt);
        player.x += movementX;

        const jumpedFromBox = this.handleJump(player, boxes, solidObstacles, dt);

        this.velocityY += this.gravity * dt;
        player.y += this.velocityY * dt;

        this.resolveCollisions(player, solidObstacles, boxes);

        return { jumpedFromBox, onGround: this.onGround };
    }
};

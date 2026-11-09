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

    reset() {
        this.keys.clear();
        this.velocityY = 0;
        this.velocityX = 0;
        this.onGround = false;
        this.coyoteTimer = 0;
        this.jumpBufferTimer = 0;
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

        const currentFriction = velocityX === 0 
            ? (this.onGround ? this.friction : this.airResistance) 
            : this.acceleration;

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

    checkHorizontalCollision(player, solidObstacles, movementX) {
        if (movementX === 0) return;
        let playerBox = player.getBoundingBox();
        
        for (const obstacle of solidObstacles) {
            const obstacleBox = obstacle.getBoundingBox();
            const overlaps = playerBox.right > obstacleBox.left && 
                             playerBox.left < obstacleBox.right && 
                             playerBox.bottom > obstacleBox.top && 
                             playerBox.top < obstacleBox.bottom;
            
            if (!overlaps) continue;

            if (movementX > 0) {
                player.x -= (playerBox.right - obstacleBox.left);
                this.velocityX = 0;
            } else {
                player.x += (obstacleBox.right - playerBox.left);
                this.velocityX = 0;
            }
            playerBox = player.getBoundingBox();
        }
    },

    checkGroundCollision(player, solidObstacles, boxes, previousBottom) {
        this.onGround = false;
        let playerBox = player.getBoundingBox();
        
        for (const obstacle of solidObstacles) {
            const obstacleBox = obstacle.getBoundingBox();
            const overlaps = playerBox.right > obstacleBox.left && 
                             playerBox.left < obstacleBox.right && 
                             playerBox.bottom > obstacleBox.top && 
                             playerBox.top < obstacleBox.bottom;
            
            if (!overlaps) continue;

            if (this.velocityY >= 0 && previousBottom <= obstacleBox.top + 10) {
                player.y -= (playerBox.bottom - obstacleBox.top);
                this.velocityY = 0;
                this.onGround = true;
                
                if (boxes.includes(obstacle)) {
                    const dragBehavior = obstacle.behaviors["Перетаскивание"];
                    if (dragBehavior) {
                        dragBehavior.isEnabled = false;
                    }
                }
            } else if (this.velocityY < 0) {
                player.y += (obstacleBox.bottom - playerBox.top);
                this.velocityY = 0;
            }
            playerBox = player.getBoundingBox();
        }
    },

    update(player, grounds, boxes, deltaTime) {
        const dt = Math.min(deltaTime, 0.1); 
        const solidObstacles = [...grounds, ...boxes];

        const movementX = this.updateHorizontalVelocity(dt);
        player.x += movementX;
        this.checkHorizontalCollision(player, solidObstacles, movementX);

        const jumpedFromBox = this.handleJump(player, boxes, solidObstacles, dt);

        this.velocityY += this.gravity * dt;
        const previousBottom = player.getBoundingBox().bottom;
        player.y += this.velocityY * dt;
        this.checkGroundCollision(player, solidObstacles, boxes, previousBottom);

        return { jumpedFromBox, onGround: this.onGround };
    }
};

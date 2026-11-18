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
    maxCollisionIterations: 12,
    crushed: false,
    runPlaying: false,
    inputBound: false,
    solids: [],
    joined: [],
    boundCache: [],
    boundCount: 0,

    reset() {
        this.keys.clear();
        this.velocityY = 0;
        this.velocityX = 0;
        this.onGround = false;
        this.coyoteTimer = 0;
        this.jumpBufferTimer = 0;
        this.lastStandingBox = null;
        this.crushed = false;
        this.runPlaying = false;
        globalThis.SoundManager?.stopAll();
    },

    initialize(runtime) {
        this.runtime = runtime;
        if (!this.inputBound) {
            this.inputBound = true;
            runtime.addEventListener("keydown", (event) => {
                this.keys.add(event.code.toLowerCase());
                this.keys.add(event.key.toLowerCase());
            });
            runtime.addEventListener("keyup", (event) => {
                this.keys.delete(event.code.toLowerCase());
                this.keys.delete(event.key.toLowerCase());
            });
            runtime.addEventListener("layoutstart", () => this.reset());
        }
        this.reset();
    },

    gravitySign() {
        const manager = globalThis.GravityManager;
        if (!manager || !manager.active || !manager.flipPlayer) return 1;
        if (!this.runtime || manager.layoutName !== this.runtime.layout?.name) return 1;
        return manager.playerSign === -1 ? -1 : 1;
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

    fill(grounds, boxes) {
        const list = this.solids;
        let count = 0;
        if (grounds) {
            for (let i = 0; i < grounds.length; i++) list[count++] = grounds[i];
        }
        if (boxes) {
            for (let i = 0; i < boxes.length; i++) list[count++] = boxes[i];
        }
        for (let i = count; i < list.length; i++) list[i] = null;
        list.length = count;
        return list;
    },

    join(list, extra) {
        const out = this.joined;
        let count = 0;
        if (list) {
            for (let i = 0; i < list.length; i++) out[count++] = list[i];
        }
        if (extra) out[count++] = extra;
        for (let i = count; i < out.length; i++) out[i] = null;
        out.length = count;
        return out;
    },

    cacheBounds(obstacles) {
        const cache = this.boundCache;
        const count = obstacles.length;
        for (let i = 0; i < count; i++) {
            const obstacle = obstacles[i];
            let rect = cache[i];
            if (!rect) {
                rect = { left: 0, right: 0, top: 0, bottom: 0, inst: null };
                cache[i] = rect;
            }
            if (!obstacle) {
                rect.inst = null;
                continue;
            }
            const box = obstacle.getBoundingBox();
            rect.left = box.left;
            rect.right = box.right;
            rect.top = box.top;
            rect.bottom = box.bottom;
            rect.inst = obstacle;
        }
        for (let i = count; i < this.boundCount; i++) {
            if (cache[i]) cache[i].inst = null;
        }
        this.boundCount = count;
        return cache;
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
            this.velocityY = -this.jumpForce * this.gravitySign();
            this.onGround = false;
            this.coyoteTimer = 0;
            globalThis.SoundManager?.play("jump");
            return true;
        }
        return false;
    },

    resolveOverlapPass(player, obstacles, boxes, trackStandingBox) {
        let landed = false;
        let standingBox = null;
        const sign = this.gravitySign();

        const cached = this.cacheBounds(obstacles);

        for (let iteration = 0; iteration < this.maxCollisionIterations; iteration++) {
            const playerBox = player.getBoundingBox();
            let deepestObstacle = null;
            let minOverlap = Infinity;
            let pushDirectionX = 0;
            let pushDirectionY = 0;

            for (let i = 0; i < this.boundCount; i++) {
                const obstacleBox = cached[i];
                const obstacle = obstacleBox.inst;
                if (!obstacle) continue;

                const overlapX1 = playerBox.right - obstacleBox.left;
                const overlapX2 = obstacleBox.right - playerBox.left;
                const overlapY1 = playerBox.bottom - obstacleBox.top;
                const overlapY2 = obstacleBox.bottom - playerBox.top;

                if (overlapX1 <= 0 || overlapX2 <= 0 || overlapY1 <= 0 || overlapY2 <= 0) continue;

                const overlapX = Math.min(overlapX1, overlapX2);
                const overlapY = Math.min(overlapY1, overlapY2);

                if (overlapX < overlapY) {
                    if (overlapX < minOverlap) {
                        minOverlap = overlapX;
                        deepestObstacle = obstacle;
                        pushDirectionX = overlapX1 < overlapX2 ? -overlapX1 : overlapX2;
                        pushDirectionY = 0;
                    }
                } else if (overlapY < minOverlap) {
                    minOverlap = overlapY;
                    deepestObstacle = obstacle;
                    pushDirectionX = 0;
                    pushDirectionY = overlapY1 < overlapY2 ? -overlapY1 : overlapY2;
                }
            }

            if (!deepestObstacle) break;

            if (pushDirectionX !== 0) {
                player.x += pushDirectionX;
                this.velocityX = 0;
            }

            if (pushDirectionY !== 0) {
                player.y += pushDirectionY;

                if (pushDirectionY * sign < 0) {
                    landed = true;
                    this.velocityY = 0;

                    if (trackStandingBox) {
                        if (boxes.includes(deepestObstacle)) {
                            standingBox = deepestObstacle;
                            if (globalThis.BoxManager && typeof globalThis.BoxManager.enableOrDisableDragging === "function") {
                                globalThis.BoxManager.enableOrDisableDragging(deepestObstacle, false);
                            }
                        } else {
                            standingBox = null;
                        }
                    }
                } else if (this.velocityY * sign < 0) {
                    this.velocityY = 0;
                }
            }
        }

        return { landed, standingBox };
    },

    resolveCollisions(player, grounds, boxes, solids) {
        this.onGround = false;
        let currentStandingBox = null;

        const solidResult = this.resolveOverlapPass(player, solids, boxes, true);
        if (solidResult.landed) {
            this.onGround = true;
            currentStandingBox = solidResult.standingBox;
        }

        const groundResult = this.resolveOverlapPass(player, grounds, boxes, false);
        if (groundResult.landed) {
            this.onGround = true;
            currentStandingBox = null;
        }

        if (this.lastStandingBox && this.lastStandingBox !== currentStandingBox) {
            if (globalThis.BoxManager && typeof globalThis.BoxManager.lockAfterJump === "function") {
                globalThis.BoxManager.lockAfterJump(this.lastStandingBox);
            }
        }
        this.lastStandingBox = currentStandingBox;
        if (this.isCrushed(player, grounds, boxes)) {
            this.crushed = true;
            this.velocityX = 0;
            this.velocityY = 0;
        }
    },

    canBeDragged(inst) {
        const behaviors = inst?.behaviors;
        if (!behaviors) return false;
        const behavior = behaviors["Перетаскивание"] || behaviors["DragDrop"];
        if (!behavior) return false;
        if (behavior.isEnabled === false || behavior.enabled === false) return false;
        return true;
    },

    overlapX(a, b) {
        return Math.min(a.right, b.right) - Math.max(a.left, b.left);
    },

    isCrushed(player, grounds, boxes) {
        const playerBox = player.getBoundingBox();
        const sign = this.gravitySign();
        const playerWidth = playerBox.right - playerBox.left;
        const minOverlapX = Math.max(16, playerWidth * 0.45);

        if (this.crushedBy(player, playerBox, grounds, grounds, boxes, sign, minOverlapX)) return true;
        if (boxes && boxes.length && this.crushedBy(player, playerBox, boxes, grounds, boxes, sign, minOverlapX)) return true;
        return false;
    },

    crushedBy(player, playerBox, list, grounds, boxes, sign, minOverlapX) {
        const crushDepth = 10;
        for (let i = 0; i < list.length; i++) {
            const solid = list[i];
            if (!solid || solid === player || this.canBeDragged(solid)) continue;

            const solidBox = solid.getBoundingBox();
            if (this.overlapX(playerBox, solidBox) < minOverlapX) continue;

            const solidHeight = solidBox.bottom - solidBox.top;
            const spansPlayer = solidBox.top < playerBox.top && solidBox.bottom > playerBox.bottom;
            if (solidHeight > 500 && spansPlayer) continue;

            if (sign > 0) {
                const coversHead = solidBox.top < playerBox.top && solidBox.bottom > playerBox.top + crushDepth;
                if (!coversHead) continue;
            } else {
                const coversFeet = solidBox.bottom > playerBox.bottom && solidBox.top < playerBox.bottom - crushDepth;
                if (!coversFeet) continue;
            }

            if (this.hasCrushSupport(playerBox, grounds, solid, sign)) return true;
            if (this.hasCrushSupport(playerBox, boxes, solid, sign)) return true;
        }
        return false;
    },

    hasCrushSupport(playerBox, solids, crusher, sign) {
        if (!solids) return false;
        for (let i = 0; i < solids.length; i++) {
            const solid = solids[i];
            if (!solid || solid === crusher) continue;
            const solidBox = solid.getBoundingBox();
            if (this.overlapX(playerBox, solidBox) < 6) continue;

            if (sign > 0) {
                const gap = playerBox.bottom - solidBox.top;
                if (gap >= -8 && gap <= 80) return true;
            } else {
                const gap = solidBox.bottom - playerBox.top;
                if (gap >= -8 && gap <= 80) return true;
            }
        }
        return false;
    },

    wantsRunSound() {
        return this.onGround && (
            this.keys.has("keya") ||
            this.keys.has("arrowleft") ||
            this.keys.has("keyd") ||
            this.keys.has("arrowright")
        );
    },

    setRunSound(playing) {
        if (playing === this.runPlaying) return;
        this.runPlaying = playing;
        const sound = globalThis.SoundManager;
        if (!sound) return;
        if (playing) sound.play("run", { loop: true });
        else sound.stop("run");
    },

    blocked() {
        if (globalThis.GameOverManager?.active) return true;
        const gravity = globalThis.GravityManager;
        return !!(gravity?.freezePlayer && gravity.layoutName === this.runtime?.layout?.name);
    },

    update(player, grounds, boxes, deltaTime) {
        if (this.crushed || this.blocked()) {
            this.velocityX = 0;
            this.velocityY = 0;
            this.setRunSound(false);
            return { jumpedFromBox: false, onGround: false, crushed: this.crushed };
        }

        const dt = Math.min(deltaTime, 0.1);
        const solidObstacles = this.fill(grounds, boxes);

        const movementX = this.updateHorizontalVelocity(dt);
        player.x += movementX;

        const jumpedFromBox = this.handleJump(player, boxes, solidObstacles, dt);

        this.velocityY += this.gravity * this.gravitySign() * dt;
        player.y += this.velocityY * dt;

        this.resolveCollisions(player, grounds, boxes, solidObstacles);

        this.setRunSound(!this.crushed && this.wantsRunSound());

        return { jumpedFromBox, onGround: this.onGround, crushed: this.crushed };
    }
};

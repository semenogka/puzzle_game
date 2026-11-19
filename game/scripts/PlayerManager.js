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
    crusherList: [],
    runPlaying: false,
    stepTimer: 0,
    trailTimer: 0,
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
        this.stepTimer = 0;
        this.trailTimer = 0;
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
            const box = this.normalized(obstacle.getBoundingBox());
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
            globalThis.EffectManager?.jump(this.runtime, player);
            return true;
        }
        return false;
    },

    normalized(box) {
        let left = box.left;
        let right = box.right;
        let top = box.top;
        let bottom = box.bottom;
        if (right < left) {
            const swap = left;
            left = right;
            right = swap;
        }
        if (bottom < top) {
            const swap = top;
            top = bottom;
            bottom = swap;
        }
        return { left, right, top, bottom };
    },

    // The sprite turns 180 degrees with gravity. Its collision polygon turns with
    // it and the engine box can come back inverted or paper-thin, so the player
    // no longer overlaps the walls. The instance size does not rotate.
    actorBox(player) {
        const width = Math.abs(player.width || 0);
        const height = Math.abs(player.height || 0);
        if (width < 1 || height < 1) return this.normalized(player.getBoundingBox());
        return {
            left: player.x - width / 2,
            right: player.x + width / 2,
            top: player.y - height / 2,
            bottom: player.y + height / 2
        };
    },

    separation(playerBox, obstacleBox) {
        const overlapX1 = playerBox.right - obstacleBox.left;
        const overlapX2 = obstacleBox.right - playerBox.left;
        const overlapY1 = playerBox.bottom - obstacleBox.top;
        const overlapY2 = obstacleBox.bottom - playerBox.top;
        if (overlapX1 <= 0 || overlapX2 <= 0 || overlapY1 <= 0 || overlapY2 <= 0) return null;

        const overlapX = Math.min(overlapX1, overlapX2);
        const overlapY = Math.min(overlapY1, overlapY2);
        const obstacleWidth = obstacleBox.right - obstacleBox.left;
        const obstacleHeight = obstacleBox.bottom - obstacleBox.top;
        const coversBody = obstacleBox.top <= playerBox.top + 1 && obstacleBox.bottom >= playerBox.bottom - 1;
        const pillar = coversBody && obstacleHeight >= obstacleWidth;
        const axis = pillar || overlapX < overlapY ? "x" : "y";
        if (axis === "x") {
            return {
                axis,
                pen: overlapX,
                push: overlapX1 < overlapX2 ? -overlapX1 : overlapX2
            };
        }
        return {
            axis,
            pen: overlapY,
            push: overlapY1 < overlapY2 ? -overlapY1 : overlapY2
        };
    },

    resolveOverlapPass(player, obstacles, boxes, trackStandingBox) {
        let landed = false;
        let standingBox = null;
        const sign = this.gravitySign();

        const cached = this.cacheBounds(obstacles);

        for (let iteration = 0; iteration < this.maxCollisionIterations; iteration++) {
            const playerBox = this.actorBox(player);
            let deepestObstacle = null;
            let minOverlap = Infinity;
            let pushDirectionX = 0;
            let pushDirectionY = 0;

            for (let i = 0; i < this.boundCount; i++) {
                const obstacleBox = cached[i];
                const obstacle = obstacleBox.inst;
                if (!obstacle) continue;
                const hit = this.separation(playerBox, obstacleBox);
                if (!hit || hit.pen >= minOverlap) continue;
                minOverlap = hit.pen;
                deepestObstacle = obstacle;
                pushDirectionX = hit.axis === "x" ? hit.push : 0;
                pushDirectionY = hit.axis === "y" ? hit.push : 0;
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
        const height = playerBox.bottom - playerBox.top;
        const width = playerBox.right - playerBox.left;
        if (height < 4 || width < 4) return false;

        const minOverlapX = Math.max(16, width * 0.5);
        const sign = this.gravitySign();
        const crushers = this.collectCrushers(boxes);
        if (!crushers.length) return false;
        if (!this.hasVerticalSupport(playerBox, grounds, crushers, minOverlapX, sign)) return false;

        for (let i = 0; i < crushers.length; i++) {
            const inst = crushers[i];
            if (!inst || inst.destroyed || inst === player || this.canBeDragged(inst)) continue;
            const box = inst.getBoundingBox();
            if (this.overlapX(playerBox, box) < minOverlapX) continue;
            if (this.pressesAlongGravity(playerBox, box, width, height, sign)) return true;
        }
        return false;
    },

    collectCrushers(boxes) {
        const list = this.crusherList;
        let count = 0;
        const bodies = globalThis.GravityManager?.bodies;
        if (bodies) {
            for (let i = 0; i < bodies.length; i++) {
                const inst = bodies[i]?.inst;
                if (inst && !inst.destroyed) list[count++] = inst;
            }
        }
        if (boxes) {
            for (let i = 0; i < boxes.length; i++) {
                const inst = boxes[i];
                if (!inst || inst.destroyed) continue;
                let seen = false;
                for (let j = 0; j < count; j++) {
                    if (list[j] === inst) {
                        seen = true;
                        break;
                    }
                }
                if (!seen) list[count++] = inst;
            }
        }
        list.length = count;
        return list;
    },

    hasVerticalSupport(playerBox, grounds, crushers, minOverlapX, sign) {
        if (this.supportIn(playerBox, grounds, minOverlapX, sign)) return true;
        if (this.supportIn(playerBox, crushers, minOverlapX, sign)) return true;
        return false;
    },

    supportIn(playerBox, list, minOverlapX, sign) {
        if (!list) return false;
        for (let i = 0; i < list.length; i++) {
            const solid = list[i];
            if (!solid || solid.destroyed) continue;
            const box = solid.getBoundingBox();
            if (this.overlapX(playerBox, box) < minOverlapX) continue;
            if (sign > 0) {
                const gap = playerBox.bottom - box.top;
                if (gap >= -8 && gap <= 16 && box.bottom > playerBox.bottom - 2) return true;
            } else {
                const gap = box.bottom - playerBox.top;
                if (gap >= -8 && gap <= 16 && box.top < playerBox.top + 2) return true;
            }
        }
        return false;
    },

    pressesAlongGravity(playerBox, box, width, height, sign) {
        const overlapY = Math.min(playerBox.bottom, box.bottom) - Math.max(playerBox.top, box.top);
        if (overlapY < -2) return false;
        if (this.sideBump(playerBox, box, width, overlapY)) return false;
        if (sign > 0) {
            if (box.bottom < playerBox.top - 2) return false;
            if (box.top > playerBox.top + height * 0.35) return false;
            return true;
        }
        if (box.top > playerBox.bottom + 2) return false;
        if (box.bottom < playerBox.bottom - height * 0.35) return false;
        return true;
    },

    sideBump(playerBox, box, width, overlapY) {
        const overlapX = this.overlapX(playerBox, box);
        if (overlapX <= 0) return true;
        if (overlapX >= width * 0.8) return false;
        const center = (box.left + box.right) / 2;
        const overPlayer = center > playerBox.left + width * 0.15 && center < playerBox.right - width * 0.15;
        if (!overPlayer) return true;
        return overlapX < overlapY;
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
        const wasOnGround = this.onGround;
        const fallSpeed = this.velocityY;
        const solidObstacles = this.fill(grounds, boxes);

        const movementX = this.updateHorizontalVelocity(dt);
        globalThis.GravityManager?.shoveBoxes(player, movementX);
        player.x += movementX;

        const jumpedFromBox = this.handleJump(player, boxes, solidObstacles, dt);

        this.velocityY += this.gravity * this.gravitySign() * dt;
        player.y += this.velocityY * dt;

        this.resolveCollisions(player, grounds, boxes, solidObstacles);

        if (!this.crushed && !wasOnGround && this.onGround && Math.abs(fallSpeed) > 260) {
            globalThis.EffectManager?.land(this.runtime, player);
        }

        const running = !this.crushed && this.wantsRunSound();
        this.setRunSound(running);
        if (running) {
            this.stepTimer -= dt;
            if (this.stepTimer <= 0) {
                this.stepTimer = 0.16;
                globalThis.EffectManager?.step(this.runtime, player);
            }
        }
        if (!this.crushed && !this.onGround && Math.abs(this.velocityY) > 140) {
            this.trailTimer -= dt;
            if (this.trailTimer <= 0) {
                this.trailTimer = 0.05;
                globalThis.EffectManager?.trail(this.runtime, player);
            }
        }

        return { jumpedFromBox, onGround: this.onGround, crushed: this.crushed };
    }
};

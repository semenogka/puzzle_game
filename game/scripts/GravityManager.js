globalThis.GravityManager = {
	active: false,
	runtime: null,
	layoutName: "",
	flipPlayer: false,
	objectTag: null,
	objectGravity: 1400,
	playerSign: 1,
	player: null,
	playerPending: false,
	playerLeftSurface: false,
	playerAnim: null,
	bodies: [],
	grounds: [],
	empty: [],
	groundSet: new Set(),
	obstacles: [],
	playerSolids: [],
	solidList: [],
	boundCache: [],
	boundCount: 0,
	bodyHit: { landed: false, hitGround: false },
	supportSeen: new Set(),
	flipLock: 0,
	uprighting: false,
	freezePlayer: false,
	prevFlipKey: false,
	animDuration: 0.42,
	shake: null,
	tickBound: false,
	pushBoxes: false,

	easeIn(t) {
		const x = Math.min(1, Math.max(0, t));
		return x * x * x * x * x;
	},

	hasTag(inst, tag) {
		if (!inst || !tag) return false;
		if (typeof inst.hasTag === "function" && inst.hasTag(tag)) return true;
		const raw = inst.tags ?? inst.tag ?? "";
		const list = Array.isArray(raw) ? raw : String(raw).split(/\s+/);
		return list.includes(tag);
	},

	initialize(runtime, config) {
		const options = config || {};
		this.runtime = runtime;
		this.layoutName = runtime.layout.name;
		this.active = true;
		this.flipPlayer = !!options.flipPlayer;
		this.objectTag = options.objectTag || null;
		this.objectGravity = options.objectGravity || 1400;
		this.pushBoxes = !!options.pushBoxes;
		this.playerSign = 1;
		this.playerPending = false;
		this.playerLeftSurface = false;
		this.playerAnim = null;
		this.flipLock = 0;
		this.uprighting = false;
		this.freezePlayer = false;
		this.bodies.length = 0;
		this.grounds = this.empty;
		this.shake = null;
		this.bindFlipKey();
		this.collectObjects(runtime);
		this.ensureTick(runtime);
		this.centerView(runtime);
	},

	rectsHit(a, b) {
		const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
		const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
		if (ox <= 2 || oy <= 2) return false;
		if (oy < 10 && oy < ox) return false;
		return true;
	},

	boxBlocked(box) {
		const bounds = box.getBoundingBox();
		const grounds = this.grounds || [];
		for (let i = 0; i < grounds.length; i++) {
			const ground = grounds[i];
			if (!ground || ground === box) continue;
			if (this.rectsHit(bounds, ground.getBoundingBox())) return true;
		}
		for (let i = 0; i < this.bodies.length; i++) {
			const other = this.bodies[i].inst;
			if (!other || other === box) continue;
			if (this.rectsHit(bounds, other.getBoundingBox())) return true;
		}
		return false;
	},

	shoveBoxes(player, movementX) {
		if (!this.pushBoxes || !this.active || !movementX || !player) return;
		const dir = movementX > 0 ? 1 : -1;
		const travel = Math.abs(movementX);
		const playerBox = player.getBoundingBox();
		let closest = null;
		let closestGap = Infinity;

		for (let i = 0; i < this.bodies.length; i++) {
			const box = this.bodies[i].inst;
			if (!box) continue;
			const bounds = box.getBoundingBox();
			const overlapY = Math.min(playerBox.bottom, bounds.bottom) - Math.max(playerBox.top, bounds.top);
			if (overlapY < 28) continue;
			const gap = dir > 0 ? bounds.left - playerBox.right : playerBox.left - bounds.right;
			if (gap > travel + 1 || gap < -36) continue;
			if (gap < closestGap) {
				closestGap = gap;
				closest = box;
			}
		}

		if (!closest) return;
		const push = travel - Math.max(0, closestGap);
		if (push <= 0) return;
		const old = closest.x;
		closest.x += dir * push;
		if (this.boxBlocked(closest)) closest.x = old;
	},

	bind(player) {
		this.player = player || null;
	},

	bindFlipKey() {
		const keys = globalThis.PlayerManager?.keys;
		this.prevFlipKey = !!(keys && (keys.has("keyq") || keys.has("q")));
	},

	release() {
		this.active = false;
		this.player = null;
		this.playerAnim = null;
		this.bodies.length = 0;
		this.grounds = this.empty;
		this.shake = null;
		this.uprighting = false;
		this.freezePlayer = false;
		this.playerPending = false;
		this.playerLeftSurface = false;
		this.pushBoxes = false;
		this.obstacles.length = 0;
		this.playerSolids.length = 0;
		this.solidList.length = 0;
		this.groundSet.clear();
		for (let i = 0; i < this.boundCount; i++) {
			if (this.boundCache[i]) this.boundCache[i].inst = null;
		}
		this.boundCount = 0;
	},

	centerView(runtime) {
		const layer = runtime.layout.getLayer(0);
		if (!layer || typeof layer.scrollTo !== "function") return;
		layer.scrollTo(runtime.layout.width / 2, runtime.layout.height / 2);
	},

	ensureTick(runtime) {
		if (this.tickBound) return;
		this.tickBound = true;
		runtime.addEventListener("tick", () => {
			if (!this.active || !this.runtime) return;
			if (this.layoutName !== this.runtime.layout?.name) return;
			this.tickEffects(Math.min(this.runtime.dt || 0, 0.05));
		});
	},

	collectObjects(runtime) {
		this.bodies.length = 0;
		if (!this.objectTag || !runtime.objects.Box) return;
		const boxes = runtime.objects.Box.getAllInstances();
		for (const inst of boxes) {
			if (!this.hasTag(inst, this.objectTag)) continue;
			const drag = inst.behaviors?.["Перетаскивание"] || inst.behaviors?.["DragDrop"];
			if (drag) drag.isEnabled = false;
			this.bodies.push({
				inst,
				vy: 0,
				sign: this.hasTag(inst, "up") ? -1 : 1,
				onGround: false,
				pending: false,
				leftSurface: false,
				anim: null
			});
		}
	},

	getSolids() {
		const list = this.solidList;
		let count = 0;
		const bodies = this.bodies;
		for (let i = 0; i < bodies.length; i++) {
			const inst = bodies[i].inst;
			if (inst) list[count++] = inst;
		}
		list.length = count;
		return list;
	},

	playerGrounds(grounds) {
		const list = this.playerSolids;
		let count = 0;
		if (grounds) {
			for (let i = 0; i < grounds.length; i++) list[count++] = grounds[i];
		}
		const bodies = this.bodies;
		for (let i = 0; i < bodies.length; i++) {
			const inst = bodies[i].inst;
			if (inst) list[count++] = inst;
		}
		list.length = count;
		return list;
	},

	setGrounds(grounds) {
		this.grounds = grounds || [];
	},

	flipPressed() {
		const keys = globalThis.PlayerManager?.keys;
		if (!keys) return false;
		const down = keys.has("keyq") || keys.has("q");
		const pressed = down && !this.prevFlipKey;
		this.prevFlipKey = down;
		return pressed;
	},

	startAngleAnim(inst, slot) {
		if (!inst) return;
		const from = inst.angle || 0;
		const anim = {
			inst,
			from,
			to: from + Math.PI,
			elapsed: 0
		};
		if (slot === "player") this.playerAnim = anim;
		else slot.anim = anim;
	},

	holdsDoor(player) {
		if (!this.active || !this.flipPlayer) return false;
		if (!this.runtime || this.layoutName !== this.runtime.layout?.name) return false;
		if (this.uprighting) return true;
		if (this.freezePlayer) {
			this.freezePlayer = false;
			return false;
		}
		if (this.playerSign !== -1) return false;
		this.beginUpright(player);
		return true;
	},

	beginUpright(player) {
		const inst = player || this.player;
		if (!inst || this.uprighting) return;
		this.player = inst;
		this.uprighting = true;
		this.freezePlayer = true;
		this.playerSign = 1;
		this.playerPending = false;
		this.flipLock = 1;
		const playerManager = globalThis.PlayerManager;
		if (playerManager) {
			playerManager.velocityX = 0;
			playerManager.velocityY = 0;
		}
		this.playerAnim = {
			inst,
			from: inst.angle || 0,
			to: (inst.angle || 0) + Math.PI,
			elapsed: 0,
			settleUpright: true
		};
		globalThis.EffectManager?.flip(this.runtime, inst);
	},

	readBounds(inst) {
		const box = inst.getBoundingBox();
		return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
	},

	restingAgainst(mover, support, sign) {
		const overlapX = Math.min(mover.right, support.right) - Math.max(mover.left, support.left);
		if (overlapX <= 6) return false;
		if (sign > 0) {
			const gap = mover.bottom - support.top;
			return gap >= -6 && gap <= 12;
		}
		const gap = support.bottom - mover.top;
		return gap >= -6 && gap <= 12;
	},

	bodySupported(body, seen) {
		const inst = body.inst;
		if (!inst) return true;
		if (seen.has(body)) return false;
		seen.add(body);
		const rect = this.readBounds(inst);
		const grounds = this.grounds || [];
		for (let i = 0; i < grounds.length; i++) {
			const ground = grounds[i];
			if (!ground || ground === inst) continue;
			if (this.restingAgainst(rect, this.readBounds(ground), body.sign)) return true;
		}
		for (let i = 0; i < this.bodies.length; i++) {
			const other = this.bodies[i];
			if (!other || other === body || !other.inst) continue;
			if (!this.restingAgainst(rect, this.readBounds(other.inst), body.sign)) continue;
			if (this.bodySupported(other, seen)) return true;
		}
		return false;
	},

	canFlip() {
		if (this.player && globalThis.PlayerManager && !globalThis.PlayerManager.onGround) return false;
		const seen = this.supportSeen;
		for (let i = 0; i < this.bodies.length; i++) {
			seen.clear();
			if (!this.bodySupported(this.bodies[i], seen)) return false;
		}
		return true;
	},

	flip() {
		if (this.uprighting || this.freezePlayer || globalThis.GameOverManager?.active) return;
		if (this.flipLock > 0) return;
		if (!this.canFlip()) return;
		const hasPlayer = this.flipPlayer && this.player;
		const hasBodies = this.bodies.length > 0;
		if (!hasPlayer && !hasBodies) return;

		this.flipLock = 1;

		if (hasPlayer) {
			this.playerSign *= -1;
			if (globalThis.PlayerManager) {
				globalThis.PlayerManager.velocityY = 0;
				globalThis.PlayerManager.onGround = false;
			}
			this.playerPending = true;
			this.playerLeftSurface = false;
			this.player.y += this.playerSign * 4;
			this.startAngleAnim(this.player, "player");
		}

		for (const body of this.bodies) {
			body.sign *= -1;
			body.vy = 0;
			body.pending = true;
			body.leftSurface = false;
			body.onGround = false;
			body.inst.y += body.sign * 4;
			// this.startAngleAnim(body.inst, body);
		}

		const effects = globalThis.EffectManager;
		if (!effects || !this.runtime) return;
		if (hasPlayer) effects.flip(this.runtime, this.player);
		for (let i = 0; i < this.bodies.length; i++) effects.lift(this.runtime, this.bodies[i].inst);
	},

	preUpdate(deltaTime, grounds) {
		if (!this.active) return;
		if (grounds) this.grounds = grounds;
		const dt = Math.min(deltaTime || 0, 0.05);
		this.flipLock = Math.max(0, this.flipLock - dt);
		if (this.flipPressed()) this.flip();
		this.updateBodies(dt);
	},

	postUpdate(player, grounds) {
		if (!this.active) return;
		if (player) this.player = player;
		if (grounds) this.grounds = grounds;
		this.updatePlayerImpact();
	},

	updateBodies(dt) {
		const grounds = this.grounds;
		const groundSet = this.groundSet;
		groundSet.clear();
		const obstacles = this.obstacles;
		let count = 0;
		for (let i = 0; i < grounds.length; i++) {
			const ground = grounds[i];
			obstacles[count++] = ground;
			groundSet.add(ground);
		}
		const bodies = this.bodies;
		for (let i = 0; i < bodies.length; i++) {
			const inst = bodies[i].inst;
			if (inst) obstacles[count++] = inst;
		}
		obstacles.length = count;

		for (const body of this.bodies) {
			const inst = body.inst;
			if (!inst) continue;

			body.vy += this.objectGravity * body.sign * dt;
			const maxSpeed = 1500;
			if (body.vy > maxSpeed) body.vy = maxSpeed;
			if (body.vy < -maxSpeed) body.vy = -maxSpeed;
			inst.y += body.vy * dt;

			const hit = this.resolveBody(body, obstacles, groundSet);
			const resting = hit.landed || this.restingOn(inst, grounds, body.sign);

			if (resting && body.vy * body.sign > 0) body.vy = 0;

			if (!resting) {
				body.onGround = false;
				body.leftSurface = true;
				continue;
			}

			body.onGround = true;
			if (body.pending && body.leftSurface && hit.hitGround) {
				body.pending = false;
				body.leftSurface = false;
				this.startShake(inst.layer);
				globalThis.EffectManager?.impact(this.runtime, inst, body.sign);
			}
		}
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

	resolveBody(body, obstacles, groundSet) {
		const inst = body.inst;
		const hit = this.bodyHit;
		hit.landed = false;
		hit.hitGround = false;
		const cached = this.cacheBounds(obstacles);

		for (let iteration = 0; iteration < 8; iteration++) {
			const bounds = inst.getBoundingBox();
			let closest = null;
			let minOverlap = Infinity;
			let pushX = 0;
			let pushY = 0;

			for (let i = 0; i < this.boundCount; i++) {
				const obstacleBounds = cached[i];
				const obstacle = obstacleBounds.inst;
				if (!obstacle || obstacle === inst) continue;

				const overlapX1 = bounds.right - obstacleBounds.left;
				const overlapX2 = obstacleBounds.right - bounds.left;
				const overlapY1 = bounds.bottom - obstacleBounds.top;
				const overlapY2 = obstacleBounds.bottom - bounds.top;

				if (overlapX1 <= 0 || overlapX2 <= 0 || overlapY1 <= 0 || overlapY2 <= 0) continue;

				const overlapX = Math.min(overlapX1, overlapX2);
				const overlapY = Math.min(overlapY1, overlapY2);

				if (overlapX < overlapY) {
					if (overlapX < minOverlap) {
						minOverlap = overlapX;
						closest = obstacle;
						pushX = overlapX1 < overlapX2 ? -overlapX1 : overlapX2;
						pushY = 0;
					}
				} else if (overlapY < minOverlap) {
					minOverlap = overlapY;
					closest = obstacle;
					pushX = 0;
					pushY = overlapY1 < overlapY2 ? -overlapY1 : overlapY2;
				}
			}

			if (!closest) break;

			inst.x += pushX;
			inst.y += pushY;

			if (pushY !== 0 && pushY * body.sign < 0) {
				hit.landed = true;
				body.vy = 0;
				if (groundSet.has(closest)) hit.hitGround = true;
			} else if (pushY !== 0 && body.vy * body.sign < 0) {
				body.vy = 0;
			}
		}

		return hit;
	},

	restingOn(inst, grounds, sign) {
		if (!inst || !grounds) return false;
		const bounds = this.readBounds(inst);
		for (let i = 0; i < grounds.length; i++) {
			const ground = grounds[i];
			if (!ground) continue;
			if (this.restingAgainst(bounds, this.readBounds(ground), sign)) return true;
		}
		return false;
	},

	updatePlayerImpact() {
		if (!this.flipPlayer || !this.playerPending || !this.player) return;
		const onGround = !!globalThis.PlayerManager?.onGround;
		if (!onGround) {
			this.playerLeftSurface = true;
			return;
		}
		if (!this.playerLeftSurface) return;
		if (!this.restingOn(this.player, this.grounds, this.playerSign)) return;
		this.playerPending = false;
		this.playerLeftSurface = false;
		this.startShake(this.player.layer);
	},

	advanceAnim(anim, dt) {
		if (!anim || !anim.inst) return null;
		anim.elapsed += dt;
		const t = Math.min(1, anim.elapsed / this.animDuration);
		anim.inst.angle = anim.from + (anim.to - anim.from) * this.easeIn(t);
		if (t >= 1) {
			anim.inst.angle = anim.settleUpright ? 0 : anim.to;
			if (anim.settleUpright) this.uprighting = false;
			return null;
		}
		return anim;
	},

	tickEffects(dt) {
		if (globalThis.GameOverManager?.active) return;
		this.playerAnim = this.advanceAnim(this.playerAnim, dt);
		for (const body of this.bodies) {
			body.anim = this.advanceAnim(body.anim, dt);
		}
		this.updateShake(dt);
	},

	startShake(layer) {
		if (!layer || typeof layer.scrollX !== "number") return;
		if (!this.shake) {
			this.shake = {
				layer,
				baseX: layer.scrollX,
				baseY: layer.scrollY,
				elapsed: 0,
				duration: 0.22,
				magnitude: 8
			};
			return;
		}
		this.shake.elapsed = 0;
		this.shake.magnitude = Math.min(12, this.shake.magnitude + 3);
	},

	scrollLayer(layer, x, y) {
		if (typeof layer.scrollTo === "function") {
			layer.scrollTo(x, y);
			return;
		}
		layer.scrollX = x;
		layer.scrollY = y;
	},

	updateShake(dt) {
		if (!this.shake) return;
		const shake = this.shake;
		shake.elapsed += dt;
		const t = shake.elapsed / shake.duration;
		if (t >= 1) {
			this.scrollLayer(shake.layer, shake.baseX, shake.baseY);
			this.shake = null;
			return;
		}
		const damp = (1 - t) * (1 - t);
		const offsetX = Math.sin(shake.elapsed * 62) * shake.magnitude * damp;
		const offsetY = Math.cos(shake.elapsed * 48) * shake.magnitude * 0.65 * damp;
		this.scrollLayer(shake.layer, shake.baseX + offsetX, shake.baseY + offsetY);
	}
};

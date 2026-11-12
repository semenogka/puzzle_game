globalThis.TransitionManager = {
	runtime: null,
	// exit transition (current level -> next)
	active: false,
	player: null,
	nextLayout: null,
	centerX: 0,
	centerY: 0,
	phase: "idle",
	moveDuration: 1,
	moveElapsed: 0,
	moveStartX: 0,
	moveStartY: 0,
	fadeObjects: [],
	fadeDuration: 0.3,
	fadeStagger: 0.05,
	fadeElapsed: 0,
	totalFadeDuration: 0,
	pendingEntry: false,

	// entry transition (next level start)
	entryActive: false,
	entryPlayer: null,
	entryPhase: "idle",
	entryTargetX: 0,
	entryTargetY: 0,
	entryMoveDuration: 1,
	entryMoveElapsed: 0,
	entryMoveStartX: 0,
	entryMoveStartY: 0,
	entryFadeObjects: [],
	entryFadeDuration: 0.3,
	entryFadeStagger: 0.05,
	entryFadeElapsed: 0,
	entryTotalFadeDuration: 0,

	reset() {
		this.active = false;
		this.phase = "idle";
		this.player = null;
		this.nextLayout = null;
		this.fadeObjects = [];
		this.moveElapsed = 0;
		this.fadeElapsed = 0;

		this.entryActive = false;
		this.entryPhase = "idle";
		this.entryPlayer = null;
		this.entryFadeObjects = [];
		this.entryMoveElapsed = 0;
		this.entryFadeElapsed = 0;
		// pendingEntry is intentionally preserved across reset
	},

	initialize(runtime, player) {
		if (this.runtime !== runtime) {
			this.runtime = runtime;
		}
		// Do not wipe an entry transition that has just been started by the
		// previous layout's "layoutstart" listener.
		if (!this.pendingEntry && !this.entryActive && !this.active) {
			this.reset();
		}
		// If we arrived here via a level transition, start the entry
		// transition as a method at the beginning of the level.
		if (this.pendingEntry && player && !this.entryActive && !this.active) {
			this.startEntry(runtime, player);
		}
	},

	computeCenter(player) {
		try {
			const layer = player ? player.layer : this.runtime.layout.getLayer(0);
			const vp = layer.getViewport();
			this.centerX = (vp.left + vp.right) / 2;
			this.centerY = (vp.top + vp.bottom) / 2;
		} catch (e) {
			this.centerX = (this.runtime?.layout?.width || 1920) / 2;
			this.centerY = (this.runtime?.layout?.height || 1080) / 2;
		}
	},

	collectFadeObjects(cx, cy, player) {
		const rt = this.runtime;
		const objs = [];
		try {
			for (const key in rt.objects) {
				let cls;
				try { cls = rt.objects[key]; } catch (e) { continue; }
				if (!cls || typeof cls.getAllInstances !== "function") continue;
				let instances = [];
				try { instances = cls.getAllInstances() || []; } catch (e) { continue; }
				for (const inst of instances) {
					if (!inst || inst === player) continue;
					if (typeof inst.opacity === "undefined") continue;
					try {
						if (inst.objectType && inst.objectType.name === "Player") continue;
					} catch (e) {}
					objs.push(inst);
				}
			}
		} catch (e) {
			console.error("TransitionManager: collect failed", e);
		}
		objs.sort((a, b) => {
			const da = Math.hypot((a.x || 0) - cx, (a.y || 0) - cy);
			const db = Math.hypot((b.x || 0) - cx, (b.y || 0) - cy);
			return da - db;
		});
		return objs;
	},

	start(runtime, player, nextLayout) {
		if (this.active || this.entryActive) return;
		this.runtime = runtime || this.runtime;
		this.player = player;
		this.nextLayout = nextLayout;
		this.active = true;
		this.phase = "moving";
		this.moveElapsed = 0;
		this.fadeElapsed = 0;
		this.fadeObjects = [];

		if (player) {
			this.moveStartX = player.x;
			this.moveStartY = player.y;
		}

		this.computeCenter(player);

		const pm = globalThis.PlayerManager;
		if (pm) {
			pm.velocityX = 0;
			pm.velocityY = 0;
		}
	},

	beginFade() {
		const player = this.player;
		const cx = this.centerX;
		const cy = this.centerY;
		const objs = this.collectFadeObjects(cx, cy, player);

		const n = objs.length;
		const maxTotal = 1.8;
		const stagger = (n > 1)
			? Math.min(0.06, Math.max(0.01, (maxTotal - this.fadeDuration) / (n - 1)))
			: 0;

		this.fadeObjects = objs.map((inst, i) => ({
			inst,
			startOpacity: (typeof inst.opacity === "number") ? inst.opacity : 1,
			delay: i * stagger,
			duration: this.fadeDuration
		}));

		this.totalFadeDuration = this.fadeObjects.length
			? (this.fadeObjects[this.fadeObjects.length - 1].delay + this.fadeDuration)
			: 0;
		this.fadeElapsed = 0;
		this.phase = "fading";
	},

	startEntry(runtime, player) {
		if (this.entryActive || this.active) return;
		this.runtime = runtime || this.runtime;
		this.entryPlayer = player;
		this.entryActive = true;
		this.pendingEntry = false;

		this.computeCenter(player);
		// target = current player position (before moving)
		this.entryTargetX = player ? player.x : this.centerX;
		this.entryTargetY = player ? player.y : this.centerY;

		if (player) {
			player.x = this.centerX;
			player.y = this.centerY;
		}

		const objs = this.collectFadeObjects(this.centerX, this.centerY, player);
		const n = objs.length;
		const maxTotal = 1.8;
		const stagger = (n > 1)
			? Math.min(0.06, Math.max(0.01, (maxTotal - this.entryFadeDuration) / (n - 1)))
			: 0;

		this.entryFadeObjects = objs.map((inst, i) => ({
			inst,
			startOpacity: (typeof inst.opacity === "number") ? inst.opacity : 1,
			delay: i * stagger,
			duration: this.entryFadeDuration
		}));
		// start invisible
		for (const o of this.entryFadeObjects) {
			try { o.inst.opacity = 0; } catch (e) {}
		}

		this.entryTotalFadeDuration = this.entryFadeObjects.length
			? (this.entryFadeObjects[this.entryFadeObjects.length - 1].delay + this.entryFadeDuration)
			: 0;
		this.entryFadeElapsed = 0;
		this.entryMoveElapsed = 0;
		this.entryPhase = "fadeIn";

		const pm = globalThis.PlayerManager;
		if (pm) {
			pm.velocityX = 0;
			pm.velocityY = 0;
		}
	},

	update(deltaTime) {
		const dt = Math.min(deltaTime || 0, 0.1);

		// exit transition
		if (this.active) {
			const player = this.player;
			if (this.phase === "moving") {
				this.moveElapsed += dt;
				const t = Math.min(this.moveElapsed / this.moveDuration, 1);
				const smooth = t * t * (3 - 2 * t);
				if (player) {
					player.x = this.moveStartX + (this.centerX - this.moveStartX) * smooth;
					player.y = this.moveStartY + (this.centerY - this.moveStartY) * smooth;
				}
				if (t >= 1) {
					if (player) {
						player.x = this.centerX;
						player.y = this.centerY;
					}
					this.beginFade();
				}
				return;
			}

			if (this.phase === "fading") {
				this.fadeElapsed += dt;
				for (const o of this.fadeObjects) {
					const local = this.fadeElapsed - o.delay;
					if (local <= 0) {
						try { o.inst.opacity = o.startOpacity; } catch (e) {}
						continue;
					}
					const t = Math.min(local / o.duration, 1);
					const smooth = t * t * (3 - 2 * t);
					try { o.inst.opacity = o.startOpacity * (1 - smooth); } catch (e) {}
				}
				if (this.fadeElapsed >= this.totalFadeDuration) {
					for (const o of this.fadeObjects) {
						try { o.inst.opacity = 0; } catch (e) {}
					}
					this.pendingEntry = true;
					this.active = false;
					this.phase = "idle";
					const rt = this.runtime;
					const next = this.nextLayout;
					this.player = null;
					this.nextLayout = null;
					if (rt && next) {
						rt.goToLayout(next);
					}
				}
				return;
			}
			return;
		}

		// entry transition
		if (!this.entryActive) return;
		const player = this.entryPlayer;

		if (this.entryPhase === "fadeIn") {
			this.entryFadeElapsed += dt;
			for (const o of this.entryFadeObjects) {
				const local = this.entryFadeElapsed - o.delay;
				if (local <= 0) {
					try { o.inst.opacity = 0; } catch (e) {}
					continue;
				}
				const t = Math.min(local / o.duration, 1);
				const smooth = t * t * (3 - 2 * t);
				try { o.inst.opacity = o.startOpacity * smooth; } catch (e) {}
			}
			if (this.entryFadeElapsed >= this.entryTotalFadeDuration) {
				for (const o of this.entryFadeObjects) {
					try { o.inst.opacity = o.startOpacity; } catch (e) {}
				}
				this.entryPhase = "moveToTarget";
				this.entryMoveElapsed = 0;
				if (player) {
					this.entryMoveStartX = player.x;
					this.entryMoveStartY = player.y;
				}
			}
			return;
		}

		if (this.entryPhase === "moveToTarget") {
			this.entryMoveElapsed += dt;
			const t = Math.min(this.entryMoveElapsed / this.entryMoveDuration, 1);
			const smooth = t * t * (3 - 2 * t);
			if (player) {
				player.x = this.entryMoveStartX + (this.entryTargetX - this.entryMoveStartX) * smooth;
				player.y = this.entryMoveStartY + (this.entryTargetY - this.entryMoveStartY) * smooth;
			}
			if (t >= 1) {
				if (player) {
					player.x = this.entryTargetX;
					player.y = this.entryTargetY;
				}
				this.entryActive = false;
				this.entryPhase = "idle";
				this.entryPlayer = null;
				this.entryFadeObjects = [];
			}
			return;
		}
	}
};
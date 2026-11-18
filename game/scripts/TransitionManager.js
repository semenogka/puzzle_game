globalThis.TransitionManager = {
	runtime: null,
	bound: false,
	lastTick: -1,
	classes: null,

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
	maxFade: 1.6,
	fadeElapsed: 0,
	totalFadeDuration: 0,
	pendingEntry: false,

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
	entryFadeElapsed: 0,
	entryTotalFadeDuration: 0,

	bind(runtime) {
		if (this.bound || !runtime) return;
		this.bound = true;
		this.runtime = runtime;
		runtime.addEventListener("tick", () => {
			if (!this.active && !this.entryActive) return;
			const tick = runtime.tickCount;
			if (tick === this.lastTick) return;
			this.lastTick = tick;
			this.advance(Math.min(runtime.dt || 0, 0.05));
		});
	},

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
	},

	initialize(runtime, player) {
		this.bind(runtime);
		this.runtime = runtime;
		if (!this.pendingEntry && !this.entryActive && !this.active) this.reset();
		if (this.pendingEntry && player && !this.entryActive && !this.active) {
			this.startEntry(runtime, player);
		}
	},

	// Old level scripts may still call this. The clock lives in bind(), so a second call in the same tick does nothing.
	update() {},

	smooth(t) {
		return t * t * (3 - 2 * t);
	},

	objectClasses() {
		if (this.classes) return this.classes;
		const classes = [];
		const objects = this.runtime.objects;
		for (const key in objects) {
			try {
				const cls = objects[key];
				if (cls && typeof cls.getAllInstances === "function") classes.push(cls);
			} catch (error) {
				// Some runtime object keys are not object types.
			}
		}
		this.classes = classes;
		return classes;
	},

	computeCenter(player) {
		const layer = player ? player.layer : this.runtime.layout.getLayer(0);
		const view = layer.getViewport();
		this.centerX = (view.left + view.right) / 2;
		this.centerY = (view.top + view.bottom) / 2;
	},

	collectFadeObjects(cx, cy, player) {
		const objs = [];
		const classes = this.objectClasses();
		for (let i = 0; i < classes.length; i++) {
			let instances;
			try {
				instances = classes[i].getAllInstances();
			} catch (error) {
				continue;
			}
			for (let j = 0; j < instances.length; j++) {
				const inst = instances[j];
				if (!inst || inst === player || inst.opacity == null) continue;
				if (inst.objectType?.name === "Player") continue;
				objs.push(inst);
			}
		}
		objs.sort((a, b) => {
			const da = (a.x - cx) * (a.x - cx) + (a.y - cy) * (a.y - cy);
			const db = (b.x - cx) * (b.x - cx) + (b.y - cy) * (b.y - cy);
			return da - db;
		});
		return objs;
	},

	makeFade(instances, reveal) {
		const count = instances.length;
		const stagger = count > 1
			? Math.min(this.fadeStagger, Math.max(0.01, (this.maxFade - this.fadeDuration) / (count - 1)))
			: 0;
		const items = new Array(count);
		for (let i = 0; i < count; i++) {
			const inst = instances[i];
			const visible = typeof inst.opacity === "number" ? inst.opacity : 1;
			items[i] = {
				inst,
				from: reveal ? 0 : visible,
				to: reveal ? visible : 0,
				delay: i * stagger,
				duration: this.fadeDuration
			};
			if (reveal) inst.opacity = 0;
		}
		return {
			items,
			total: count ? items[count - 1].delay + this.fadeDuration : 0
		};
	},

	applyFade(items, elapsed) {
		for (let i = 0; i < items.length; i++) {
			const item = items[i];
			const inst = item.inst;
			if (!inst) continue;
			const local = elapsed - item.delay;
			if (local <= 0) {
				inst.opacity = item.from;
				continue;
			}
			const t = local >= item.duration ? 1 : local / item.duration;
			const blend = this.smooth(t);
			inst.opacity = item.from + (item.to - item.from) * blend;
		}
	},

	place(player, elapsed, duration, fromX, fromY, toX, toY) {
		if (!player) return elapsed >= duration;
		const t = Math.min(elapsed / duration, 1);
		const blend = this.smooth(t);
		player.x = fromX + (toX - fromX) * blend;
		player.y = fromY + (toY - fromY) * blend;
		return t >= 1;
	},

	stopPlayer() {
		const playerManager = globalThis.PlayerManager;
		if (!playerManager) return;
		playerManager.velocityX = 0;
		playerManager.velocityY = 0;
	},

	start(runtime, player, nextLayout) {
		if (this.active || this.entryActive) return;
		this.bind(runtime);
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
		this.stopPlayer();
	},

	beginFade() {
		const fade = this.makeFade(this.collectFadeObjects(this.centerX, this.centerY, this.player), false);
		this.fadeObjects = fade.items;
		this.totalFadeDuration = fade.total;
		this.fadeElapsed = 0;
		this.phase = "fading";
	},

	startEntry(runtime, player) {
		if (this.entryActive || this.active) return;
		this.bind(runtime);
		this.runtime = runtime || this.runtime;
		this.entryPlayer = player;
		this.entryActive = true;
		this.pendingEntry = false;
		this.computeCenter(player);
		this.entryTargetX = player ? player.x : this.centerX;
		this.entryTargetY = player ? player.y : this.centerY;
		if (player) {
			player.x = this.centerX;
			player.y = this.centerY;
		}
		const fade = this.makeFade(this.collectFadeObjects(this.centerX, this.centerY, player), true);
		this.entryFadeObjects = fade.items;
		this.entryTotalFadeDuration = fade.total;
		this.entryFadeElapsed = 0;
		this.entryMoveElapsed = 0;
		this.entryPhase = "fadeIn";
		this.stopPlayer();
	},

	advance(dt) {
		if (this.active) {
			this.advanceExit(dt);
			return;
		}
		if (this.entryActive) this.advanceEntry(dt);
	},

	advanceExit(dt) {
		const player = this.player;
		if (this.phase === "moving") {
			this.moveElapsed += dt;
			const done = this.place(
				player,
				this.moveElapsed,
				this.moveDuration,
				this.moveStartX,
				this.moveStartY,
				this.centerX,
				this.centerY
			);
			if (done) this.beginFade();
			return;
		}

		if (this.phase !== "fading") return;
		this.fadeElapsed += dt;
		this.applyFade(this.fadeObjects, this.fadeElapsed);
		if (this.fadeElapsed < this.totalFadeDuration) return;

		this.pendingEntry = true;
		this.active = false;
		this.phase = "idle";
		const runtime = this.runtime;
		const next = this.nextLayout;
		this.player = null;
		this.nextLayout = null;
		this.fadeObjects = [];
		if (runtime && next) runtime.goToLayout(next);
	},

	advanceEntry(dt) {
		const player = this.entryPlayer;
		if (this.entryPhase === "fadeIn") {
			this.entryFadeElapsed += dt;
			this.applyFade(this.entryFadeObjects, this.entryFadeElapsed);
			if (this.entryFadeElapsed < this.entryTotalFadeDuration) return;
			this.entryPhase = "moveToTarget";
			this.entryMoveElapsed = 0;
			if (player) {
				this.entryMoveStartX = player.x;
				this.entryMoveStartY = player.y;
			}
			return;
		}

		if (this.entryPhase !== "moveToTarget") return;
		this.entryMoveElapsed += dt;
		const done = this.place(
			player,
			this.entryMoveElapsed,
			this.entryMoveDuration,
			this.entryMoveStartX,
			this.entryMoveStartY,
			this.entryTargetX,
			this.entryTargetY
		);
		if (!done) return;
		this.entryActive = false;
		this.entryPhase = "idle";
		this.entryPlayer = null;
		this.entryFadeObjects = [];
	}
};

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
	overlay: null,
	bitsHold: 1.05,
	bitsElapsed: 0,
	entryBitsHold: 0.42,

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
		this.clearOverlay();
		this.active = false;
		this.phase = "idle";
		this.player = null;
		this.nextLayout = null;
		this.fadeObjects = [];
		this.moveElapsed = 0;
		this.fadeElapsed = 0;
		this.bitsElapsed = 0;

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
				if (this.ownsInstance(inst)) continue;
				if (globalThis.EffectManager?.owns?.(inst)) continue;
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
		globalThis.EffectManager?.door(this.runtime, player);
	},

	beginFade() {
		const fade = this.makeFade(this.collectFadeObjects(this.centerX, this.centerY, this.player), false);
		this.fadeObjects = fade.items;
		this.totalFadeDuration = fade.total;
		this.fadeElapsed = 0;
		this.buildOverlay();
		this.setOverlayOpacity(0);
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
		this.buildOverlay();
		this.setOverlayOpacity(1);
		this.entryPhase = "bits";
		this.entryBitsElapsed = 0;
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

		if (this.phase === "fading") {
			this.fadeElapsed += dt;
			this.applyFade(this.fadeObjects, this.fadeElapsed);
			this.tickOverlay(dt);
			const span = this.totalFadeDuration || 0.01;
			this.setOverlayOpacity(this.smooth(Math.min(1, this.fadeElapsed / span)));
			if (this.fadeElapsed < this.totalFadeDuration) return;
			this.setOverlayOpacity(1);
			this.phase = "bits";
			this.bitsElapsed = 0;
			return;
		}

		if (this.phase !== "bits") return;
		this.bitsElapsed += dt;
		this.tickOverlay(dt);
		if (this.bitsElapsed < this.bitsHold) return;

		const runtime = this.runtime;
		const next = this.nextLayout;
		if (!this.hasLayout(runtime, next)) {
			this.pendingEntry = false;
			this.active = false;
			this.phase = "idle";
			this.applyFade(this.fadeObjects, 0);
			this.clearOverlay();
			this.player = null;
			this.nextLayout = null;
			this.fadeObjects = [];
			return;
		}

		this.clearOverlay();
		this.pendingEntry = true;
		this.active = false;
		this.phase = "idle";
		this.player = null;
		this.nextLayout = null;
		this.fadeObjects = [];
		try {
			runtime.goToLayout(next);
		} catch (error) {
			this.pendingEntry = false;
		}
	},

	hasLayout(runtime, name) {
		if (!runtime || !name) return false;
		if (typeof runtime.getLayout !== "function") return true;
		try {
			return !!runtime.getLayout(name);
		} catch (error) {
			return false;
		}
	},

	advanceEntry(dt) {
		const player = this.entryPlayer;
		if (this.entryPhase === "bits") {
			this.entryBitsElapsed += dt;
			this.tickOverlay(dt);
			if (this.entryBitsElapsed < this.entryBitsHold) return;
			this.entryPhase = "fadeIn";
			this.entryFadeElapsed = 0;
			return;
		}

		if (this.entryPhase === "fadeIn") {
			this.entryFadeElapsed += dt;
			this.applyFade(this.entryFadeObjects, this.entryFadeElapsed);
			this.tickOverlay(dt);
			const cover = 1 - this.smooth(Math.min(1, this.entryFadeElapsed / 0.55));
			this.setOverlayOpacity(cover);
			const fadeDone = this.entryFadeElapsed >= this.entryTotalFadeDuration;
			const coverDone = this.entryFadeElapsed >= 0.55;
			if (!fadeDone || !coverDone) return;
			this.clearOverlay();
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
	},

	layerRef(layer) {
		if (typeof layer === "number" || typeof layer === "string") return layer;
		if (typeof layer?.index === "number") return layer.index;
		if (typeof layer?.name === "string") return layer.name;
		return 0;
	},

	bit(blank) {
		if (Math.random() < blank) return " ";
		return Math.random() < 0.5 ? "0" : "1";
	},

	// Same failure as the motes: assigning text after a font change calls into a
	// typewriter renderer that is still null. Keep the font the instance was
	// created with, and ignore a setter that is not ready yet.
	writeText(inst, value) {
		if (!inst) return false;
		try {
			inst.text = value;
			return true;
		} catch (error) {
			return false;
		}
	},

	ownsInstance(inst) {
		return !!(this.overlay && this.overlay.nodes && this.overlay.nodes.has(inst));
	},

	buildOverlay() {
		this.clearOverlay();
		const runtime = this.runtime;
		if (!runtime?.layout) return;
		const player = this.player || this.entryPlayer;
		const layerInst = player?.layer || runtime.layout.getLayer(0);
		if (!layerInst || typeof layerInst.getViewport !== "function") return;
		const spriteType = runtime.objects["Спрайт"];
		const textType = runtime.objects["Текст"];
		if (!spriteType || !textType) return;

		const layer = this.layerRef(layerInst);
		const view = layerInst.getViewport();
		const left = view.left;
		const top = view.top;
		const width = view.right - view.left;
		const height = view.bottom - view.top;
		const nodes = new Set();

		let veil = null;
		try {
			veil = spriteType.createInstance(layer, (view.left + view.right) / 2, (view.top + view.bottom) / 2);
		} catch (error) {
			return;
		}
		veil.width = width + 12;
		veil.height = height + 12;
		veil.opacity = 1;
		if (veil.colorRgb) veil.colorRgb = [0, 0, 0];
		nodes.add(veil);

		const columns = [];
		const count = 28;
		const colW = width / count;
		const rows = Math.max(18, Math.round(height / 28));
		for (let i = 0; i < count; i++) {
			let inst = null;
			try {
				inst = textType.createInstance(layer, left + i * colW, top);
			} catch (error) {
				continue;
			}
			inst.width = colW;
			inst.height = height;
			inst.opacity = 1;
			const lines = new Array(rows);
			for (let r = 0; r < rows; r++) lines[r] = this.bit(0.2);
			const ready = this.writeText(inst, lines.join("\n"));
			try {
				if ("horizontalAlign" in inst) inst.horizontalAlign = "center";
				if ("verticalAlign" in inst) inst.verticalAlign = "top";
				if ("isBold" in inst) inst.isBold = false;
				if ("fontColor" in inst) inst.fontColor = [0.62, 0.9, 0.8];
			} catch (error) {
				// The column still reads if a style property is unavailable.
			}
			nodes.add(inst);
			columns.push({
				inst,
				lines,
				frozen: !ready,
				step: 0.05 + (i % 5) * 0.02,
				age: Math.random() * 0.2,
				depth: 0.42 + (i % 4) * 0.16,
				flicker: 1.3 + (i % 6) * 0.28
			});
		}

		const heads = [];
		const headCount = 36;
		for (let i = 0; i < headCount; i++) {
			let inst = null;
			try {
				inst = textType.createInstance(layer, left, top);
			} catch (error) {
				continue;
			}
			inst.width = 48;
			inst.height = 48;
			inst.opacity = 0.45 + (i % 3) * 0.18;
			const glyph = Math.random() < 0.5 ? "0" : "1";
			if (!this.writeText(inst, glyph)) inst.opacity = 0;
			try {
				if ("sizePt" in inst) inst.sizePt = 18 + (i % 5) * 4;
				if ("horizontalAlign" in inst) inst.horizontalAlign = "center";
				if ("verticalAlign" in inst) inst.verticalAlign = "center";
				if ("isBold" in inst) inst.isBold = false;
				if ("fontColor" in inst) {
					inst.fontColor = i % 4 === 0 ? [0.92, 1, 0.96] : [0.45, 0.82, 0.72];
				}
			} catch (error) {
				// A falling digit can keep the default style.
			}
			const x = left + Math.random() * width;
			const y = top + Math.random() * height;
			inst.x = x - 24;
			inst.y = y - 24;
			nodes.add(inst);
			heads.push({
				inst,
				x,
				y,
				speed: 160 + (i % 7) * 55,
				alpha: inst.opacity
			});
		}

		this.overlay = { veil, columns, heads, nodes, time: 0, left, top, width, height };
		this.raiseOverlay();
	},

	raiseOverlay() {
		const overlay = this.overlay;
		if (!overlay) return;
		if (typeof overlay.veil?.moveToTop === "function") overlay.veil.moveToTop();
		const columns = overlay.columns;
		for (let i = 0; i < columns.length; i++) {
			if (typeof columns[i].inst?.moveToTop === "function") columns[i].inst.moveToTop();
		}
		const heads = overlay.heads;
		for (let i = 0; i < heads.length; i++) {
			if (typeof heads[i].inst?.moveToTop === "function") heads[i].inst.moveToTop();
		}
	},

	setOverlayOpacity(opacity) {
		const overlay = this.overlay;
		if (!overlay) return;
		const value = Math.max(0, Math.min(1, opacity));
		if (overlay.veil) overlay.veil.opacity = value;
		const columns = overlay.columns;
		for (let i = 0; i < columns.length; i++) {
			if (columns[i].inst) columns[i].inst.opacity = value;
		}
		const heads = overlay.heads;
		for (let i = 0; i < heads.length; i++) {
			if (heads[i].inst) heads[i].inst.opacity = heads[i].alpha * value;
		}
	},

	tickOverlay(dt) {
		const overlay = this.overlay;
		if (!overlay) return;
		this.raiseOverlay();
		overlay.time += dt;
		const time = overlay.time;
		const columns = overlay.columns;
		for (let i = 0; i < columns.length; i++) {
			const col = columns[i];
			const inst = col.inst;
			if (!inst) continue;
			col.age += dt;
			let changed = false;
			if (col.age >= col.step) {
				col.age -= col.step;
				col.lines.shift();
				col.lines.push(this.bit(0.18));
				changed = true;
			}
			if (Math.random() < 0.08) {
				const index = (Math.random() * col.lines.length) | 0;
				const cell = col.lines[index];
				if (cell !== " ") {
					col.lines[index] = cell === "0" ? "1" : "0";
					changed = true;
				}
			}
			if (changed && !col.frozen && !this.writeText(inst, col.lines.join("\n"))) col.frozen = true;
			const wave = 0.5 + 0.5 * Math.sin(time * col.flicker - i * 0.37);
			if ("fontColor" in inst) {
				try {
					inst.fontColor = [
						0.15 + (0.2 + 0.55 * wave) * col.depth,
						0.45 + (0.25 + 0.4 * wave) * Math.min(1, col.depth + 0.35),
						0.42 + (0.22 + 0.38 * wave) * Math.min(1, col.depth + 0.3)
					];
				} catch (error) {
					// A color update must not freeze the transition.
				}
			}
		}

		const bottom = overlay.top + overlay.height + 30;
		const heads = overlay.heads;
		for (let i = 0; i < heads.length; i++) {
			const head = heads[i];
			const inst = head.inst;
			if (!inst) continue;
			head.y += head.speed * dt;
			if (head.y > bottom) {
				head.y = overlay.top - 36;
				head.x = overlay.left + Math.random() * overlay.width;
			}
			inst.x = head.x - 24;
			inst.y = head.y - 24;
		}
	},

	clearOverlay() {
		const overlay = this.overlay;
		if (!overlay) return;
		overlay.nodes.forEach((inst) => {
			try {
				inst?.destroy?.();
			} catch (error) {
				// The layout change can destroy the glyphs first.
			}
		});
		this.overlay = null;
	}
};

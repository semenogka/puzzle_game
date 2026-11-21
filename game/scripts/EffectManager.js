globalThis.EffectManager = {
	bound: false,
	runtime: null,
	owned: new Set(),
	free: [],
	live: [],
	maxLive: 42,

	bind(runtime) {
		if (this.bound || !runtime) return;
		this.bound = true;
		this.runtime = runtime;
		runtime.addEventListener("tick", () => {
			if (!this.live.length) return;
			this.advance(Math.min(runtime.dt || 0, 0.05));
		});
	},

	release() {
		this.owned.forEach((inst) => {
			try {
				inst?.destroy?.();
			} catch (error) {
				// The layout may already have destroyed the glyph.
			}
		});
		this.owned.clear();
		this.free.length = 0;
		this.live.length = 0;
	},

	owns(inst) {
		return this.owned.has(inst);
	},

	layerRef(layer) {
		if (typeof layer === "number" || typeof layer === "string") return layer;
		if (typeof layer?.index === "number") return layer.index;
		if (typeof layer?.name === "string") return layer.name;
		return 0;
	},

	// A second width write calls SetBboxChanged on a collision cell that is
	// already null and throws out of the player tick. Size is set once.
	setOpacity(inst, value) {
		try {
			inst.opacity = value;
			return true;
		} catch (error) {
			return false;
		}
	},

	resize(inst, size) {
		try {
			inst.width = size;
			inst.height = size;
			return true;
		} catch (error) {
			return false;
		}
	},

	place(inst, x, y) {
		try {
			inst.x = x;
			inst.y = y;
			return true;
		} catch (error) {
			return false;
		}
	},

	alive(inst) {
		if (!inst || inst.destroyed || inst.isDestroyed) return false;
		try {
			return Number.isFinite(inst.x) && Number.isFinite(inst.width);
		} catch (error) {
			return false;
		}
	},

	discard(inst) {
		this.owned.delete(inst);
		try {
			inst?.destroy?.();
		} catch (error) {
			// Already gone with the layout.
		}
	},

	take(runtime, layer, size) {
		while (this.free.length) {
			const inst = this.free.pop();
			if (this.alive(inst)) return { inst, fresh: false };
			this.discard(inst);
		}
		const type = runtime.objects["Спрайт"];
		if (!type) return null;
		let inst = null;
		try {
			inst = type.createInstance(this.layerRef(layer), -4000, -4000);
		} catch (error) {
			return null;
		}
		if (!inst || !this.resize(inst, size) || !this.setOpacity(inst, 0)) {
			this.discard(inst);
			return null;
		}
		this.owned.add(inst);
		return { inst, fresh: true };
	},

	blocked(force) {
		if (force) return false;
		if (globalThis.GameOverManager?.active) return true;
		const transition = globalThis.TransitionManager;
		return !!(transition && (transition.active || transition.entryActive));
	},

	emit(runtime, layer, x, y, options) {
		if (!runtime || layer == null || this.blocked(options.force)) return;
		const count = options.count || 1;
		const soft = !!options.soft;
		for (let i = 0; i < count; i++) {
			if (this.live.length >= this.maxLive) return;
			if (soft && this.live.length > 20) return;
			const life = (options.life || 0.32) * (0.75 + Math.random() * 0.4);
			const size = Math.max(4, (options.size || 18) * (0.55 + Math.random() * 0.35));
			const got = this.take(runtime, layer, size);
			if (!got) return;
			const inst = got.inst;
			const speed = (options.speed || 140) * (0.45 + Math.random() * 0.7);
			const spread = options.spread || 1;
			const angle = options.omni
				? Math.random() * Math.PI * 2
				: (options.angle || 0) + (Math.random() - 0.5) * spread;
			const alpha = options.alpha || 0.9;
			const px = x + (Math.random() - 0.5) * (options.jitter || 10);
			const py = y + (Math.random() - 0.5) * (options.jitterY || 6);
			let drawn = size;
			if (!got.fresh) {
				try {
					drawn = inst.width;
				} catch (error) {
					this.discard(inst);
					return;
				}
			}
			if (!this.setOpacity(inst, alpha) || !this.place(inst, px - drawn / 2, py - drawn / 2)) {
				this.discard(inst);
				return;
			}
			this.live.push({
				inst,
				x: px,
				y: py,
				vx: Math.cos(angle) * speed,
				vy: Math.sin(angle) * speed,
				life,
				max: life,
				size: drawn,
				gravity: options.gravity || 0,
				drag: options.drag == null ? 1.6 : options.drag,
				alpha
			});
		}
	},

	advance(dt) {
		const live = this.live;
		for (let i = live.length - 1; i >= 0; i--) {
			const mote = live[i];
			const inst = mote.inst;
			if (!inst || inst.destroyed) {
				live.splice(i, 1);
				continue;
			}
			mote.life -= dt;
			if (mote.life <= 0) {
				if (this.place(inst, -4000, -4000) && this.setOpacity(inst, 0)) this.free.push(inst);
				else this.discard(inst);
				live.splice(i, 1);
				continue;
			}
			const drag = Math.exp(-mote.drag * dt);
			mote.vx *= drag;
			mote.vy = mote.vy * drag + mote.gravity * dt;
			mote.x += mote.vx * dt;
			mote.y += mote.vy * dt;
			if (!this.place(inst, mote.x - mote.size / 2, mote.y - mote.size / 2) ||
				!this.setOpacity(inst, mote.alpha * (mote.life / mote.max))) {
				this.discard(inst);
				live.splice(i, 1);
			}
		}
	},

	feet(player) {
		const sign = globalThis.PlayerManager?.gravitySign?.() || 1;
		const bounds = player.getBoundingBox();
		return {
			x: player.x,
			y: sign > 0 ? bounds.bottom - 2 : bounds.top + 2,
			sign,
			layer: player.layer
		};
	},

	dust(runtime, player, options) {
		if (!player) return;
		const feet = this.feet(player);
		options.angle = feet.sign > 0 ? Math.PI / 2 : -Math.PI / 2;
		options.gravity = (options.gravity || 0) * feet.sign;
		this.emit(runtime, feet.layer, feet.x, feet.y, options);
	},

	jump(runtime, player) {
		this.dust(runtime, player, {
			count: 7,
			glyph: "+",
			spread: 1.5,
			speed: 170,
			life: 0.28,
			size: 20,
			gravity: 420,
			color: [0.96, 0.93, 0.84],
			jitter: 16
		});
	},

	land(runtime, player) {
		this.dust(runtime, player, {
			count: 8,
			glyph: "o",
			spread: 2.4,
			speed: 110,
			life: 0.32,
			size: 16,
			gravity: 180,
			color: [0.8, 0.78, 0.72],
			jitter: 22
		});
	},

	step(runtime, player) {
		this.dust(runtime, player, {
			count: 2,
			glyph: "o",
			soft: true,
			spread: 1.8,
			speed: 50,
			life: 0.2,
			size: 13,
			gravity: 80,
			color: [0.74, 0.73, 0.68],
			jitter: 10,
			alpha: 0.55
		});
	},

	at(runtime, inst, x, y, options) {
		if (!inst) return;
		this.emit(runtime, inst.layer, x, y, options);
	},

	trail(runtime, player) {
		if (!player) return;
		this.emit(runtime, player.layer, player.x, player.y, {
			count: 1,
			glyph: "o",
			soft: true,
			omni: true,
			speed: 18,
			life: 0.22,
			size: 12,
			gravity: 0,
			drag: 0.4,
			color: [0.78, 0.84, 0.9],
			jitter: 4,
			alpha: 0.45
		});
	},

	flip(runtime, player) {
		if (!player) return;
		this.emit(runtime, player.layer, player.x, player.y, {
			count: 16,
			glyph: "+",
			omni: true,
			speed: 280,
			life: 0.48,
			size: 20,
			gravity: 0,
			drag: 2.4,
			color: [0.62, 0.82, 0.98],
			jitter: 8
		});
	},

	lift(runtime, inst) {
		this.at(runtime, inst, inst?.x, inst?.y, {
			count: 4,
			glyph: "+",
			omni: true,
			speed: 90,
			life: 0.26,
			size: 14,
			gravity: 0,
			color: [0.7, 0.84, 0.96],
			jitter: 20,
			alpha: 0.7
		});
	},

	impact(runtime, inst, sign) {
		if (!inst) return;
		const bounds = inst.getBoundingBox();
		const y = sign > 0 ? bounds.bottom : bounds.top;
		this.at(runtime, inst, inst.x, y, {
			count: 7,
			glyph: "o",
			angle: sign > 0 ? Math.PI / 2 : -Math.PI / 2,
			spread: 2.2,
			speed: 130,
			life: 0.3,
			size: 15,
			gravity: 160 * (sign || 1),
			color: [0.72, 0.76, 0.82],
			jitter: 24
		});
	},

	button(runtime, inst) {
		if (!inst) return;
		const bounds = inst.getBoundingBox();
		this.at(runtime, inst, (bounds.left + bounds.right) / 2, bounds.top, {
			count: 9,
			glyph: "+",
			angle: -Math.PI / 2,
			spread: 1.3,
			speed: 200,
			life: 0.4,
			size: 18,
			gravity: 520,
			color: [0.28, 0.82, 0.48],
			jitter: 28
		});
	},

	gate(runtime, inst) {
		this.at(runtime, inst, inst?.x, inst?.y, {
			count: 8,
			glyph: "o",
			omni: true,
			speed: 70,
			life: 0.35,
			size: 14,
			gravity: 40,
			color: [0.68, 0.76, 0.88],
			jitter: 16,
			alpha: 0.65
		});
	},

	spike(runtime, player) {
		if (!player) return;
		this.emit(runtime, player.layer, player.x, player.y, {
			count: 14,
			glyph: "+",
			force: true,
			omni: true,
			speed: 260,
			life: 0.4,
			size: 22,
			gravity: 240,
			color: [0.95, 0.28, 0.2],
			jitter: 10
		});
	},

	door(runtime, player) {
		if (!player) return;
		this.emit(runtime, player.layer, player.x, player.y, {
			count: 12,
			glyph: "+",
			force: true,
			omni: true,
			speed: 160,
			life: 0.55,
			size: 18,
			gravity: -30,
			drag: 1.2,
			color: [0.95, 0.82, 0.38],
			jitter: 12
		});
	}
};

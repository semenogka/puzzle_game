globalThis.ButtonManager = {
	active: false,
	layoutName: "",
	runtime: null,
	buttons: [],
	gates: [],
	upColor: [0.93, 0.76, 0.18],
	downColor: [0.18, 0.62, 0.34],
	gateSpeed: 1800,

	tokens(inst) {
		const found = new Set();
		if (!inst) return [];
		if (typeof inst.getAllTags === "function") {
			for (const tag of inst.getAllTags()) found.add(String(tag).toLowerCase());
		}
		const raw = inst.tags ?? inst.tag;
		if (typeof raw === "string") {
			for (const tag of raw.split(/\s+/)) if (tag) found.add(tag.toLowerCase());
		} else if (raw && typeof raw !== "string" && typeof raw[Symbol.iterator] === "function") {
			for (const tag of raw) found.add(String(tag).toLowerCase());
		}
		if (!found.size && typeof inst.hasTag === "function") {
			const known = ["button", "gate", "toggle", "boxonly", "openup", "need2", "need3", "b1", "b2", "b3", "g1", "g2", "g3"];
			for (let i = 0; i < known.length; i++) {
				if (inst.hasTag(known[i])) found.add(known[i]);
			}
		}
		return [...found];
	},

	has(list, tag) {
		return list.includes(tag);
	},

	linkOf(list) {
		for (let i = 0; i < list.length; i++) {
			const match = /^[bg](\d+)$/.exec(list[i]);
			if (match) return match[1];
		}
		return "";
	},

	needOf(list) {
		if (this.has(list, "need3")) return 3;
		if (this.has(list, "need2")) return 2;
		return 1;
	},

	touches(a, b) {
		if (!a || !b) return false;
		const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
		if (ox < 12) return false;
		const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
		if (oy > 4) return true;
		const down = a.bottom - b.top;
		if (down >= -12 && down <= 36) return true;
		const up = b.bottom - a.top;
		if (up >= -12 && up <= 36) return true;
		return false;
	},

	release() {
		this.active = false;
		this.layoutName = "";
		this.runtime = null;
		this.buttons = [];
		this.gates = [];
	},

	initialize(runtime) {
		this.release();
		this.runtime = runtime;
		const grounds = runtime.objects.Ground?.getAllInstances?.() || [];
		for (let i = 0; i < grounds.length; i++) {
			const inst = grounds[i];
			if (!inst) continue;
			const tags = this.tokens(inst);
			if (this.has(tags, "button")) {
				this.buttons.push({
					inst,
					link: this.linkOf(tags),
					toggle: this.has(tags, "toggle"),
					boxOnly: this.has(tags, "boxonly"),
					held: false,
					latched: false,
					painted: false
				});
				continue;
			}
			if (this.has(tags, "gate")) {
				this.gates.push({
					inst,
					link: this.linkOf(tags),
					need: this.needOf(tags),
					openUp: this.has(tags, "openup"),
					home: inst.y,
					wantsOpen: false,
					wasOpen: false
				});
			}
		}
		this.layoutName = runtime.layout?.name || "";
		this.active = true;
	},

	boxBounds() {
		const bodies = globalThis.GravityManager?.bodies || [];
		const list = [];
		for (let i = 0; i < bodies.length; i++) {
			const inst = bodies[i]?.inst;
			if (!inst || inst.destroyed) continue;
			list.push(inst.getBoundingBox());
		}
		return list;
	},

	paint(inst, rgb) {
		if (!inst) return;
		try {
			inst.colorRgb = [rgb[0], rgb[1], rgb[2]];
		} catch (error) {
			// A color update must not stop the gates.
		}
	},

	sense(player) {
		const playerBox = player?.getBoundingBox?.();
		const boxes = this.boxBounds();
		for (let i = 0; i < this.buttons.length; i++) {
			const button = this.buttons[i];
			const surface = button.inst.getBoundingBox();
			let held = false;
			if (!button.boxOnly && playerBox && this.touches(playerBox, surface)) held = true;
			if (!held) {
				for (let j = 0; j < boxes.length; j++) {
					if (this.touches(boxes[j], surface)) {
						held = true;
						break;
					}
				}
			}
			button.held = held;
			if (button.toggle && held) button.latched = true;
			const down = button.latched || button.held;
			if (down !== button.painted) {
				if (down) globalThis.EffectManager?.button(this.runtime, button.inst);
				button.painted = down;
				this.paint(button.inst, down ? this.downColor : this.upColor);
			}
		}

		for (let i = 0; i < this.gates.length; i++) {
			const gate = this.gates[i];
			let count = 0;
			for (let j = 0; j < this.buttons.length; j++) {
				const button = this.buttons[j];
				if (button.link !== gate.link) continue;
				if (button.latched || button.held) count++;
			}
			gate.wantsOpen = count >= gate.need;
			if (gate.wantsOpen && !gate.wasOpen) {
				globalThis.EffectManager?.gate(this.runtime, gate.inst);
			}
			gate.wasOpen = gate.wantsOpen;
		}
	},

	moveGates(dt) {
		const step = this.gateSpeed * Math.min(Math.max(dt || 0, 0), 0.05);
		for (let i = 0; i < this.gates.length; i++) {
			const gate = this.gates[i];
			const inst = gate.inst;
			if (!inst) continue;
			const travel = (inst.height + 24) * (gate.openUp ? -1 : 1);
			const target = gate.home + (gate.wantsOpen ? travel : 0);
			const dy = target - inst.y;
			if (Math.abs(dy) <= step) inst.y = target;
			else inst.y += Math.sign(dy) * step;
		}
	},

	update(runtime, player, dt) {
		if (!this.active || !player || player.destroyed) return;
		if (this.layoutName && runtime.layout?.name && this.layoutName !== runtime.layout.name) return;
		this.runtime = runtime;
		this.sense(player);
		this.moveGates(dt);
	}
};

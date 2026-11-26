globalThis.GlassesManager = {
	active: false,
	runtime: null,
	shown: 0,
	target: 0,
	duration: 0.64,
	prevDown: false,
	veil: null,
	veilOpacity: 0,
	plain: [],
	pink: [],
	buffer: [],

	ease(t) {
		const x = Math.min(1, Math.max(0, t));
		return x * x * (3 - 2 * x);
	},

	hasTag(inst, tag) {
		if (!inst || !tag) return false;
		if (typeof inst.hasTag === "function" && inst.hasTag(tag)) return true;
		const raw = inst.tags ?? inst.tag ?? "";
		const list = Array.isArray(raw) ? raw : String(raw).split(/\s+/);
		return list.includes(tag);
	},

	role(inst) {
		if (this.hasTag(inst, "pink")) return "pink";
		if (this.hasTag(inst, "plain")) return "plain";
		return "";
	},

	keyDown() {
		const keys = globalThis.PlayerManager?.keys;
		if (!keys) return false;
		return keys.has("keye") || keys.has("e");
	},

	blocked() {
		if (globalThis.PauseManager?.paused) return true;
		if (globalThis.GameOverManager?.active) return true;
		if (globalThis.TransitionManager?.entryActive) return true;
		return false;
	},

	initialize(runtime) {
		this.release();
		this.runtime = runtime;
		this.active = true;
		this.shown = 0;
		this.target = 0;
		this.veilOpacity = 0;
		this.collect(runtime);
		this.apply(0);
		this.placeVeil();
		this.prevDown = this.keyDown();
	},

	release() {
		this.active = false;
		this.veil = null;
		this.plain.length = 0;
		this.pink.length = 0;
		this.shown = 0;
		this.target = 0;
		this.veilOpacity = 0;
		this.runtime = null;
	},

	collect(runtime) {
		const take = (inst, fromGround) => {
			if (this.hasTag(inst, "veil")) {
				this.veil = inst;
				return;
			}
			const role = this.role(inst);
			if (!role) return;
			const item = {
				inst: inst,
				x: inst.x,
				y: inst.y,
				fromGround: fromGround,
				collide: fromGround
			};
			if (role === "pink") this.pink.push(item);
			else this.plain.push(item);
		};

		const grounds = runtime.objects.Ground?.getAllInstances?.() || [];
		for (let i = 0; i < grounds.length; i++) take(grounds[i], true);

		const boxes = runtime.objects.Box?.getAllInstances?.() || [];
		for (let i = 0; i < boxes.length; i++) take(boxes[i], false);

		const pictures = runtime.objects["ы"]?.getAllInstances?.() || [];
		for (let i = 0; i < pictures.length; i++) take(pictures[i], false);

		const texts = runtime.objects["Текст"]?.getAllInstances?.() || [];
		for (let i = 0; i < texts.length; i++) take(texts[i], false);
	},

	preUpdate(deltaTime) {
		if (!this.active) return;
		const dt = deltaTime > 0 ? deltaTime : 0;
		const down = this.keyDown();
		if (!this.blocked() && down && !this.prevDown) {
			this.target = this.target > 0.5 ? 0 : 1;
		}
		this.prevDown = down;

		const step = dt / this.duration;
		if (this.shown < this.target) this.shown = Math.min(this.target, this.shown + step);
		else if (this.shown > this.target) this.shown = Math.max(this.target, this.shown - step);

		this.apply(this.ease(this.shown));
		this.placeVeil();
	},

	apply(visual) {
		const fade = Math.min(1, Math.max(0, visual));
		for (let i = 0; i < this.plain.length; i++) {
			const item = this.plain[i];
			const inst = item.inst;
			const opacity = 1 - fade;
			inst.opacity = opacity;
			inst.isVisible = opacity > 0.03;
			inst.y = item.collide ? item.y : item.y - fade * 18;
		}
		for (let i = 0; i < this.pink.length; i++) {
			const item = this.pink[i];
			const inst = item.inst;
			inst.opacity = fade;
			inst.isVisible = fade > 0.03;
			inst.y = item.collide ? item.y : item.y + (1 - fade) * 24;
		}

		let wash = fade;
		if (this.target >= 1 && this.shown < 1) {
			wash = Math.min(1, fade + Math.sin(this.shown * Math.PI) * 0.16);
		}
		this.veilOpacity = wash * 0.38;
	},

	placeVeil() {
		const veil = this.veil;
		if (!veil) return;
		const layer = this.runtime?.layout?.getLayer(0);
		const view = layer && typeof layer.getViewport === "function" ? layer.getViewport() : null;
		if (view) {
			const viewW = view.width || (view.right - view.left);
			const viewH = view.height || (view.bottom - view.top);
			const side = Math.max(viewW, viewH, 8);
			veil.width = side;
			veil.height = side;
			veil.x = view.left;
			veil.y = view.top;
			const box = typeof veil.getBoundingBox === "function" ? veil.getBoundingBox() : null;
			if (box && box.right > box.left && box.bottom > box.top) {
				const ox = (veil.x - box.left) / (box.right - box.left);
				const oy = (veil.y - box.top) / (box.bottom - box.top);
				if (ox >= 0 && ox <= 1) veil.x = view.left + ox * side;
				if (oy >= 0 && oy <= 1) veil.y = view.top + oy * side;
			}
		}
		veil.opacity = this.veilOpacity;
		veil.isVisible = this.veilOpacity > 0.012;
		if (typeof veil.moveToTop === "function") veil.moveToTop();
	},

	solids(grounds) {
		const out = this.buffer;
		let count = 0;
		const showPlain = this.shown < 0.85;
		const showPink = this.shown > 0.2;

		const push = (inst) => {
			if (!inst) return;
			out[count++] = inst;
		};

		if (grounds) {
			for (let i = 0; i < grounds.length; i++) {
				const inst = grounds[i];
				const role = this.role(inst);
				if (role === "plain") {
					if (showPlain) push(inst);
				} else if (role === "pink") {
					if (showPink) push(inst);
				} else {
					push(inst);
				}
			}
		}

		if (showPlain) {
			for (let i = 0; i < this.plain.length; i++) {
				const item = this.plain[i];
				if (item.collide && !item.fromGround) push(item.inst);
			}
		}

		if (showPink) {
			for (let i = 0; i < this.pink.length; i++) {
				const item = this.pink[i];
				if (item.collide && !item.fromGround) push(item.inst);
			}
		}

		out.length = count;
		return out;
	}
};

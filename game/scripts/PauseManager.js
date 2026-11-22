globalThis.PauseManager = {
	paused: false,
	runtime: null,
	nodes: [],
	hits: [],
	cursor: 0,
	downId: null,
	bound: false,
	idle: [0.62, 0.64, 0.66],
	hot: [0.96, 0.95, 0.93],
	muted: [0.62, 0.66, 0.7],

	bind(runtime) {
		if (this.bound) return;
		this.bound = true;
		this.runtime = runtime;
		runtime.addEventListener("keydown", (event) => this.onKey(event));
		runtime.addEventListener("tick", () => this.watchEscape());
		runtime.addEventListener("pointerdown", () => this.onDown());
		runtime.addEventListener("pointerup", () => this.onUp());
		runtime.addEventListener("pointermove", () => this.hover());
		globalThis.addEventListener("keydown", (event) => this.onKey(event), true);
	},

	blocked() {
		if (!this.runtime?.layout || this.runtime.layout.name === "Menu") return true;
		return !!globalThis.GameOverManager?.active;
	},

	watchEscape() {
		const keys = globalThis.PlayerManager?.keys;
		if (!keys) return;
		const down = keys.has("escape") || keys.has("esc");
		if (down && !this.escDown) this.toggle();
		this.escDown = down;
	},

	toggle() {
		const now = Date.now();
		if (now - (this.lastToggle || 0) < 180) return;
		if (this.blocked()) return;
		this.lastToggle = now;
		if (this.paused) this.resume();
		else this.pause();
	},

	onKey(event) {
		if (!event || event.repeat) return;
		const code = (event.code || "").toLowerCase();
		const key = (event.key || "").toLowerCase();

		if (code === "escape" || key === "escape" || key === "esc") {
			event.preventDefault?.();
			this.toggle();
			return;
		}

		if (!this.paused) return;

		if (code === "arrowup" || code === "keyw") {
			this.cursor = (this.cursor - 1 + this.hits.length) % this.hits.length;
			this.paint();
			return;
		}

		if (code === "arrowdown" || code === "keys") {
			this.cursor = (this.cursor + 1) % this.hits.length;
			this.paint();
			return;
		}

		if (code === "enter" || code === "numpadenter" || code === "space") {
			this.hits[this.cursor]?.action?.();
		}
	},

	pause() {
		if (this.paused || this.blocked()) return;
		this.paused = true;
		this.cursor = 0;
		globalThis.SoundManager?.stop("run");
		globalThis.PlayerManager && (globalThis.PlayerManager.velocityX = 0);
		this.render();
	},

	resume() {
		this.paused = false;
		this.clear();
	},

	close() {
		this.paused = false;
		this.downId = null;
		this.clear();
	},

	tick() {
		this.hover();
	},

	clear() {
		for (let i = 0; i < this.nodes.length; i++) {
			try {
				this.nodes[i]?.destroy?.();
			} catch (error) {
				// The layout change can destroy the overlay first.
			}
		}
		this.nodes = [];
		this.hits = [];
	},

	ref(layer) {
		if (typeof layer?.index === "number") return layer.index;
		return 0;
	},

	pin(inst, left, top) {
		const box = inst.getBoundingBox();
		inst.x += left - box.left;
		inst.y += top - box.top;
	},

	quiet(inst) {
		const drag = inst.behaviors?.["Перетаскивание"] || inst.behaviors?.DragDrop;
		if (drag) {
			drag.isEnabled = false;
			drag.enabled = false;
		}
		const solid = inst.behaviors?.["Твёрдый"] || inst.behaviors?.Solid;
		if (solid) {
			solid.isEnabled = false;
			solid.enabled = false;
		}
	},

	render() {
		this.clear();
		const runtime = this.runtime;
		const layer = runtime?.layout?.getLayer(0);
		if (!layer) return;
		const view = typeof layer.getViewport === "function" ? layer.getViewport() : null;
		const leftEdge = view ? view.left : 0;
		const topEdge = view ? view.top : 0;
		const rightEdge = view ? view.right : runtime.layout.width;
		const bottomEdge = view ? view.bottom : runtime.layout.height;
		const layerRef = this.ref(layer);
		const left = leftEdge + 120;

		const sprite = runtime.objects["Спрайт"];
		if (sprite) {
			const veil = sprite.createInstance(layerRef, (leftEdge + rightEdge) / 2, (topEdge + bottomEdge) / 2);
			veil.width = rightEdge - leftEdge + 8;
			veil.height = bottomEdge - topEdge + 8;
			veil.isVisible = true;
			veil.opacity = 0.62;
			if (veil.colorRgb) veil.colorRgb = [0, 0, 0];
			if (typeof veil.moveToTop === "function") veil.moveToTop();
			this.nodes.push(veil);
		}

		const text = runtime.objects["Текст"];
		const make = (value, x, y, width, height, size, color) => {
			if (!text) return null;
			const inst = text.createInstance(layerRef, x, y);
			inst.width = width;
			inst.height = height;
			inst.isVisible = true;
			inst.opacity = 1;
			try {
				if ("fontFace" in inst) inst.fontFace = "Correction Brush";
				if ("sizePt" in inst) inst.sizePt = size;
			} catch (error) {
				// Keep the font the text object already has.
			}
			try {
				inst.text = value;
			} catch (error) {
				// A missing renderer must not hide the rest of the pause screen.
			}
			if ("horizontalAlign" in inst) inst.horizontalAlign = "left";
			if ("verticalAlign" in inst) inst.verticalAlign = "center";
			if ("fontColor" in inst) inst.fontColor = color;
			if ("isBold" in inst) inst.isBold = false;
			this.pin(inst, x, y);
			if (typeof inst.moveToTop === "function") inst.moveToTop();
			this.nodes.push(inst);
			return inst;
		};

		const rule = (x, y) => {
			const type = runtime.objects.Box;
			if (!type) return null;
			const inst = type.createInstance(layerRef, x, y);
			try {
				if (typeof inst.setAnimation === "function") inst.setAnimation("SquareBlue");
			} catch (error) {
				// The hover mark is optional.
			}
			inst.width = 22;
			inst.height = 3;
			inst.isVisible = true;
			inst.opacity = 0;
			this.quiet(inst);
			const box = inst.getBoundingBox();
			inst.x += x - box.left;
			inst.y += y - (box.top + box.bottom) / 2;
			if (typeof inst.moveToTop === "function") inst.moveToTop();
			this.nodes.push(inst);
			return inst;
		};

		make("пауза", left, topEdge + 150, 420, 32, 18, this.muted);
		make("остановлено", left, topEdge + 184, 640, 78, 48, [0.94, 0.93, 0.9]);

		const add = (label, y, action) => {
			const labelText = make(label, left, y, 480, 68, 36, this.idle);
			const mark = rule(left, y + 56);
			this.hits.push({
				id: label,
				left: left - 16,
				top: y,
				right: left + 460,
				bottom: y + 68,
				text: labelText,
				mark,
				action
			});
		};

		add("Продолжить", topEdge + 320, () => this.resume());
		add("Заново", topEdge + 400, () => globalThis.RestartManager?.restart(runtime));
		add("В меню", topEdge + 480, () => {
			this.paused = true;
			runtime.goToLayout("Menu");
		});
		make("esc  —  продолжить", left, topEdge + 580, 420, 36, 18, this.muted);

		for (let i = 0; i < this.nodes.length; i++) {
			if (typeof this.nodes[i]?.moveToTop === "function") this.nodes[i].moveToTop();
		}
		this.paint();
	},

	paint() {
		for (let i = 0; i < this.hits.length; i++) {
			const hit = this.hits[i];
			const on = i === this.cursor;
			if (hit.text && "fontColor" in hit.text) hit.text.fontColor = on ? this.hot : this.idle;
			if (hit.mark) hit.mark.opacity = on ? 1 : 0;
		}
	},

	pointer() {
		const mouse = this.runtime?.mouse;
		if (!mouse || typeof mouse.getMouseX !== "function") return null;
		return { x: mouse.getMouseX(0), y: mouse.getMouseY(0) };
	},

	at(x, y) {
		for (let i = this.hits.length - 1; i >= 0; i--) {
			const hit = this.hits[i];
			if (x >= hit.left && x <= hit.right && y >= hit.top && y <= hit.bottom) return hit;
		}
		return null;
	},

	hover() {
		if (!this.paused) return;
		const point = this.pointer();
		if (!point) return;
		const hit = this.at(point.x, point.y);
		if (!hit) return;
		const index = this.hits.indexOf(hit);
		if (index < 0 || index === this.cursor) return;
		this.cursor = index;
		this.paint();
	},

	onDown() {
		if (!this.paused) return;
		const point = this.pointer();
		const hit = point ? this.at(point.x, point.y) : null;
		this.downId = hit ? hit.id : null;
	},

	onUp() {
		if (!this.paused) return;
		const point = this.pointer();
		const hit = point ? this.at(point.x, point.y) : null;
		if (hit && hit.id === this.downId) hit.action();
		this.downId = null;
	}
};

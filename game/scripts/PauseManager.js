globalThis.PauseManager = {
	paused: false,
	wantMenu: false,
	menuWait: 0,
	runtime: null,
	nodes: [],
	hits: [],
	cursor: 0,
	downId: null,
	bound: false,
	lastAct: 0,
	idle: [0.62, 0.64, 0.66],
	hot: [0.96, 0.95, 0.93],
	muted: [0.62, 0.66, 0.7],

	bind(runtime) {
		if (this.bound) return;

		this.bound = true;
		this.runtime = runtime;

		runtime.addEventListener("tick", () => this.tick());
		runtime.addEventListener("keydown", (event) => this.onKey(event));
		runtime.addEventListener("pointerdown", (event) => this.onDown(event));
		runtime.addEventListener("pointerup", (event) => this.onUp(event));
		runtime.addEventListener("pointermove", (event) => this.onMove(event));

		globalThis.addEventListener("pointerdown", (event) => this.onDown(event), true);
		globalThis.addEventListener("pointerup", (event) => this.onUp(event), true);
		globalThis.addEventListener("pointermove", (event) => this.onMove(event), true);
	},

	blocked() {
		const layout = this.runtime?.layout;

		if (!layout || layout.name === "Menu") return true;
		if (globalThis.GameOverManager?.active) return true;

		const transition = globalThis.TransitionManager;

		return !!(
			transition &&
			(transition.active || transition.entryActive || transition.pendingEntry)
		);
	},

	owns(inst) {
		return !!(inst && this.nodes.indexOf(inst) !== -1);
	},

	toggle() {
		const now = Date.now();

		if (now - (this.lastToggle || 0) < 180) return;
		if (this.wantMenu || this.blocked()) return;

		this.lastToggle = now;

		if (this.paused) this.resume();
		else this.pause();
	},

	watchEscape() {
		const keys = globalThis.PlayerManager?.keys;

		if (!keys) return;

		const down = keys.has("escape") || keys.has("esc");

		if (down && !this.escDown) this.toggle();

		this.escDown = down;
	},

	pause() {
		if (this.paused || this.blocked()) return;

		this.paused = true;
		this.cursor = 0;
		this.downId = null;

		globalThis.SoundManager?.stop?.("run");

		if (globalThis.PlayerManager) globalThis.PlayerManager.velocityX = 0;

		globalThis.BoxManager?.holdDrag(this.runtime);

		try {
			this.render();
		} catch (error) {}
	},

	resume() {
		this.paused = false;
		this.wantMenu = false;
		this.downId = null;
		this.cursor = 0;

		globalThis.BoxManager?.releaseDrag();
		this.clear();
	},

	close() {
		this.paused = false;
		this.wantMenu = false;
		this.menuWait = 0;
		this.downId = null;
		this.cursor = 0;

		globalThis.BoxManager?.releaseDrag();
		this.clear();
	},

	clear() {
		for (let i = 0; i < this.nodes.length; i++) {
			try {
				this.nodes[i]?.destroy?.();
			} catch (error) {}
		}

		this.nodes = [];
		this.hits = [];
	},

	tick() {
		this.watchEscape();
		this.flushMenu();
	},

	flushMenu() {
		if (!this.wantMenu || !this.runtime) return;

		this.menuWait += 1;

		let held = false;
		const mouse = this.runtime.mouse;

		if (mouse && typeof mouse.isMouseButtonDown === "function") {
			try {
				held = !!mouse.isMouseButtonDown(0);
			} catch (error) {
				held = false;
			}
		}

		if (held && this.menuWait < 8) return;

		const runtime = this.runtime;

		this.wantMenu = false;
		this.menuWait = 0;
		this.close();
		runtime.goToLayout("Menu");
	},

	render() {
		const runtime = this.runtime;
		const layer = runtime?.layout?.getLayer?.(0);

		if (!runtime || !layer) return;

		this.clear();

		let view = null;

		try {
			view = layer.getViewport();
		} catch (error) {
			view = null;
		}

		const leftEdge = view ? view.left : 0;
		const topEdge = view ? view.top : 0;
		const rightEdge = view ? view.right : runtime.layout.width;
		const bottomEdge = view ? view.bottom : runtime.layout.height;
		const layerIndex = typeof layer.index === "number" ? layer.index : 0;
		const sprite = runtime.objects["Спрайт"];

		if (sprite) {
			const veil = sprite.createInstance(
				layerIndex,
				(leftEdge + rightEdge) / 2,
				(topEdge + bottomEdge) / 2
			);

			veil.width = rightEdge - leftEdge + 8;
			veil.height = bottomEdge - topEdge + 8;
			veil.isVisible = true;
			veil.opacity = 0.62;

			try {
				veil.colorRgb = [0, 0, 0];
			} catch (error) {}

			veil.moveToTop?.();
			this.nodes.push(veil);
		}

		const text = runtime.objects["Текст"];

		const add = (label, y, action) => {
			if (!text) return;

			const inst = text.createInstance(layerIndex, leftEdge + 120, y);

			inst.text = label;
			inst.width = 460;
			inst.height = 68;
			inst.isVisible = true;
			inst.opacity = 1;

			try {
				inst.sizePt = 42;
			} catch (error) {}

			try {
				inst.fontColor = this.idle.slice();
			} catch (error) {}

			inst.moveToTop?.();
			this.nodes.push(inst);

			let left = leftEdge + 120;
			let top = y;
			let right = left + 460;
			let bottom = y + 68;

			try {
				const box = inst.getBoundingBox();

				if (box && box.right - box.left > 2 && box.bottom - box.top > 2) {
					left = box.left;
					top = box.top;
					right = box.right;
					bottom = box.bottom;
				}
			} catch (error) {}

			this.hits.push({
				id: inst.uid,
				left,
				top,
				right,
				bottom,
				text: inst,
				action
			});
		};

		add("Продолжить", topEdge + 320, () => this.resume());
		add("Заново", topEdge + 400, () => {
			this.close();
			globalThis.RestartManager?.restart(runtime);
		});
		add("В меню", topEdge + 480, () => {
			this.wantMenu = true;
			this.menuWait = 0;
		});

		if (text) {
			const hint = text.createInstance(layerIndex, leftEdge + 120, topEdge + 580);

			hint.text = "esc  —  продолжить";
			hint.width = 420;
			hint.height = 36;
			hint.isVisible = true;
			hint.opacity = 1;

			try {
				hint.sizePt = 18;
			} catch (error) {}

			try {
				hint.fontColor = this.muted.slice();
			} catch (error) {}

			hint.moveToTop?.();
			this.nodes.push(hint);
		}

		this.paint();
	},

	paint() {
		for (let i = 0; i < this.hits.length; i++) {
			const hit = this.hits[i];

			if (!hit.text || !("fontColor" in hit.text)) continue;

			hit.text.fontColor = (i === this.cursor ? this.hot : this.idle).slice();
		}
	},

	mousePoint() {
		const runtime = this.runtime;
		const mouse = runtime?.mouse || runtime?.objects?.["Мышь"];
		const layer = runtime?.layout?.getLayer?.(0);

		if (!mouse || typeof mouse.getMouseX !== "function" || !layer) return null;

		const args = [layer, layer.name];

		for (let i = 0; i < args.length; i++) {
			if (args[i] == null || args[i] === "") continue;

			try {
				const x = mouse.getMouseX(args[i]);
				const y = mouse.getMouseY(args[i]);

				if (Number.isFinite(x) && Number.isFinite(y)) return { x, y };
			} catch (error) {}
		}

		return null;
	},

	at(x, y) {
		for (let i = this.hits.length - 1; i >= 0; i--) {
			const hit = this.hits[i];

			if (
				x >= hit.left - 16 &&
				x <= hit.right + 16 &&
				y >= hit.top - 16 &&
				y <= hit.bottom + 16
			) {
				return hit;
			}
		}

		return null;
	},

	pick(event) {
		const layer = this.runtime?.layout?.getLayer?.(0);

		if (event && layer && typeof layer.layerToCssPx === "function") {
			const clicks = [
				[event.clientX, event.clientY],
				[event.pageX, event.pageY]
			];

			for (let i = this.hits.length - 1; i >= 0; i--) {
				const hit = this.hits[i];
				let first;
				let second;

				try {
					first = layer.layerToCssPx(hit.left, hit.top);
					second = layer.layerToCssPx(hit.right, hit.bottom);
				} catch (error) {
					continue;
				}

				const ax = first?.x ?? first?.[0];
				const ay = first?.y ?? first?.[1];
				const bx = second?.x ?? second?.[0];
				const by = second?.y ?? second?.[1];

				if (![ax, ay, bx, by].every(Number.isFinite)) continue;

				const left = Math.min(ax, bx) - 14;
				const right = Math.max(ax, bx) + 14;
				const top = Math.min(ay, by) - 14;
				const bottom = Math.max(ay, by) + 14;

				for (let c = 0; c < clicks.length; c++) {
					if (
						clicks[c][0] >= left &&
						clicks[c][0] <= right &&
						clicks[c][1] >= top &&
						clicks[c][1] <= bottom
					) {
						return hit;
					}
				}
			}
		}

		const point = this.mousePoint();

		return point ? this.at(point.x, point.y) : null;
	},

	onDown(event) {
		if (this.wantMenu || !this.paused || this.runtime?.layout?.name === "Menu") {
			return;
		}

		const hit = this.pick(event);

		this.downId = hit ? hit.id : null;
	},

	onMove(event) {
		if (this.wantMenu || !this.paused || this.runtime?.layout?.name === "Menu") {
			return;
		}

		const hit = this.pick(event);

		if (!hit) return;

		const index = this.hits.indexOf(hit);

		if (index < 0 || index === this.cursor) return;

		this.cursor = index;
		this.paint();
	},

	onUp(event) {
		if (this.wantMenu || !this.paused || this.runtime?.layout?.name === "Menu") {
			return;
		}

		const hit = this.pick(event);

		if (!hit) return;

		const now = Date.now();

		if (now - this.lastAct < 120) return;

		this.lastAct = now;
		this.downId = null;
		hit.action?.();
	},

	onKey(event) {
		if (!event || event.repeat) return;
		if (!this.paused || this.blocked() || this.wantMenu || !this.hits.length) return;

		const code = (event.code || "").toLowerCase();
		const key = (event.key || "").toLowerCase();

		if (code === "escape" || key === "escape" || key === "esc") return;

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
	}
};

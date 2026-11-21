globalThis.GameOverManager = {
	active: false,
	ready: false,
	elapsed: 0,
	duration: 0.55,
	readyAt: 0.4,
	runtime: null,
	layoutName: "",
	nodes: [],
	bound: false,

	easeOut(t) {
		const x = 1 - Math.min(1, Math.max(0, t));
		return 1 - x * x * x;
	},

	initialize(runtime) {
		if (this.bound) return;
		this.bound = true;
		this.runtime = runtime;
		runtime.addEventListener("tick", () => this.tick());
		runtime.addEventListener("keydown", (event) => this.onKey(event));
		runtime.addEventListener("pointerdown", () => this.requestRestart());
		runtime.addEventListener("layoutstart", () => this.dismiss());
	},

	copy(reason) {
		if (typeof reason === "string") {
			return { title: "Вы погибли", detail: reason, hint: "R  —  заново" };
		}
		const options = reason || {};
		return {
			title: options.title || "Вы погибли",
			detail: options.detail || options.text || "",
			hint: options.hint || "R  —  заново"
		};
	},

	show(runtime, player, reason) {
		if (this.active) return;
		this.initialize(runtime);
		this.runtime = runtime;
		this.layoutName = runtime.layout?.name || "";
		this.active = true;
		this.ready = false;
		this.elapsed = 0;
		this.nodes = [];
		globalThis.BoxManager?.dropAll(runtime);
		const playerManager = globalThis.PlayerManager;
		if (playerManager) {
			playerManager.velocityX = 0;
			playerManager.velocityY = 0;
			playerManager.runPlaying = false;
		}
		globalThis.SoundManager?.stopAll();
		globalThis.TransitionManager && (globalThis.TransitionManager.pendingEntry = false);

		const layer = player?.layer || runtime.layout.getLayer(0);
		if (!layer) return;
		const layerRef = this.layerRef(layer);

		const view = layer.getViewport();
		const cx = (view.left + view.right) / 2;
		const cy = (view.top + view.bottom) / 2;
		const viewWidth = view.right - view.left;
		const viewHeight = view.bottom - view.top;

		const copy = this.copy(reason);
		const veil = this.panel(runtime, layerRef, cx, cy, viewWidth + 8, viewHeight + 8, 0);
		const card = this.panel(runtime, layerRef, cx, cy + 8, 680, 360, 0);
		const accent = this.accent(runtime, layerRef, cx, cy - 92);

		const title = this.label(runtime, layerRef, cx, cy - 48, 600, 96, copy.title, 68, [0.97, 0.96, 0.93]);
		const detail = copy.detail
			? this.label(runtime, layerRef, cx, cy + 28, 560, 64, copy.detail, 28, [0.78, 0.78, 0.76])
			: null;
		const hint = this.label(runtime, layerRef, cx, cy + 108, 560, 48, copy.hint, 22, [0.62, 0.74, 0.82]);

		this.nodes = [veil, card, accent, title, detail, hint].filter(Boolean);
		for (const node of this.nodes) {
			if (typeof node.moveToTop === "function") node.moveToTop();
		}
		this.veil = veil;
		this.card = card;
		this.cardWidth = 680;
		this.cardHeight = 360;
		this.apply(0);
	},

	layerRef(layer) {
		if (typeof layer === "number" || typeof layer === "string") return layer;
		if (typeof layer?.index === "number") return layer.index;
		if (typeof layer?.name === "string") return layer.name;
		return 0;
	},

	panel(runtime, layer, x, y, width, height, opacity) {
		const type = runtime.objects["Спрайт"];
		if (!type) return null;
		const inst = type.createInstance(layer, x, y);
		inst.width = width;
		inst.height = height;
		inst.opacity = opacity;
		if (inst.colorRgb) inst.colorRgb = [0, 0, 0];
		return inst;
	},

	accent(runtime, layer, x, y) {
		const type = runtime.objects.Box;
		if (!type) return null;
		const inst = type.createInstance(layer, x, y);
		try {
			if (typeof inst.setAnimation === "function") inst.setAnimation("SquareBlue");
		} catch (error) {
			// The accent is decorative if the animation name is unavailable.
		}
		inst.width = 92;
		inst.height = 6;
		inst.opacity = 0;
		const drag = inst.behaviors?.["Перетаскивание"] || inst.behaviors?.["DragDrop"];
		if (drag) drag.isEnabled = false;
		return inst;
	},

	label(runtime, layer, centerX, centerY, width, height, text, size, color) {
		const type = runtime.objects["Текст"];
		if (!type) return null;
		const inst = type.createInstance(layer, centerX - width / 2, centerY - height / 2);
		inst.width = width;
		inst.height = height;
		inst.opacity = 0;
		try {
			inst.text = text;
		} catch (error) {
			// A missing typewriter renderer must not hide the death screen.
		}
		try {
			if ("fontFace" in inst) inst.fontFace = "Correction Brush";
			if ("sizePt" in inst) inst.sizePt = size;
		} catch (error) {
			// The label still shows in the default face.
		}
		if ("horizontalAlign" in inst) inst.horizontalAlign = "center";
		if ("verticalAlign" in inst) inst.verticalAlign = "center";
		if ("fontColor" in inst) inst.fontColor = color;
		if ("isBold" in inst) inst.isBold = false;
		const bounds = inst.getBoundingBox();
		inst.x += centerX - (bounds.left + bounds.right) / 2;
		inst.y += centerY - (bounds.top + bounds.bottom) / 2;
		return inst;
	},

	apply(progress) {
		const eased = this.easeOut(progress);
		if (this.veil) this.veil.opacity = 0.9 * eased;
		if (this.card) {
			const scale = 0.9 + 0.1 * eased;
			this.card.width = this.cardWidth * scale;
			this.card.height = this.cardHeight * scale;
			this.card.opacity = eased;
		}
		for (const node of this.nodes) {
			if (!node || node === this.veil || node === this.card) continue;
			node.opacity = eased;
		}
	},

	tick() {
		if (!this.active || !this.runtime) return;
		if (this.layoutName && this.runtime.layout?.name !== this.layoutName) {
			this.dismiss();
			return;
		}
		this.elapsed += Math.min(this.runtime.dt || 0, 0.05);
		this.apply(Math.min(1, this.elapsed / this.duration));
		if (this.elapsed >= this.readyAt) this.ready = true;
	},

	onKey(event) {
		const code = (event.code || "").toLowerCase();
		if (code === "keyr" || code === "enter" || code === "numpadenter" || code === "space") {
			this.requestRestart();
		}
	},

	requestRestart() {
		if (!this.active || !this.ready || !this.runtime) return;
		const layoutName = this.layoutName || this.runtime.layout?.name;
		this.dismiss();
		if (globalThis.TransitionManager) globalThis.TransitionManager.pendingEntry = false;
		if (layoutName) this.runtime.goToLayout(layoutName);
	},

	dismiss() {
		for (const node of this.nodes) {
			try {
				node?.destroy?.();
			} catch (error) {
				// The layout change can destroy instances first.
			}
		}
		this.nodes = [];
		this.veil = null;
		this.card = null;
		this.active = false;
		this.ready = false;
		this.elapsed = 0;
	}
};

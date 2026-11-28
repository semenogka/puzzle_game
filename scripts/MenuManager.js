globalThis.MenuManager = {
	runtime: null,
	open: false,
	screen: "home",
	items: [],
	drag: "",
	downId: null,
	cursor: 0,
	tries: 0,
	lastAct: 0,
	bound: false,
	idle: [0.62, 0.64, 0.66],
	hot: [0.97, 0.96, 0.93],

	bind(runtime) {
		if (this.bound) return;

		this.bound = true;
		this.runtime = runtime;

		runtime.addEventListener("tick", () => this.tick());
		runtime.addEventListener("pointerdown", (event) => this.onDown(event));
		runtime.addEventListener("pointerup", (event) => this.onUp(event));
		runtime.addEventListener("pointermove", (event) => this.onMove(event));
		runtime.addEventListener("keydown", (event) => this.onKey(event));

		globalThis.addEventListener("pointerdown", (event) => this.onDown(event), true);
		globalThis.addEventListener("pointerup", (event) => this.onUp(event), true);
		globalThis.addEventListener("pointermove", (event) => this.onMove(event), true);

		runtime.addEventListener("layoutstart", () => {
			if (runtime.layout?.name === "Menu") this.start(runtime);
			else this.dismiss();
		});
	},

	loadSettings() {
		try {
			const music = localStorage.getItem("norm.music");
			const sound = localStorage.getItem("norm.sound");

			if (music != null && music !== "") {
				globalThis.MusicManager?.setVolume(Number(music));
			}

			if (sound != null && sound !== "") {
				globalThis.SoundManager?.setMasterVolume(Number(sound));
			}
		} catch (error) {}
	},

	saveSettings() {
		try {
			localStorage.setItem(
				"norm.music",
				String(globalThis.MusicManager?.volume ?? 0.35)
			);
			localStorage.setItem(
				"norm.sound",
				String(globalThis.SoundManager?.masterVolume ?? 1)
			);
		} catch (error) {}
	},

	tags(inst) {
		const found = [];

		const add = (value) => {
			const text = String(value ?? "").toLowerCase().trim();

			if (!text) return;

			const parts = text.split(/\s+/);

			for (let i = 0; i < parts.length; i++) {
				if (parts[i] && found.indexOf(parts[i]) < 0) found.push(parts[i]);
			}
		};

		if (!inst || inst.destroyed) return found;

		try {
			if (typeof inst.getAllTags === "function") {
				for (const tag of inst.getAllTags()) add(tag);
			}
		} catch (error) {}

		try {
			const raw = inst.tags;

			if (typeof raw === "string") add(raw);
			else if (raw && typeof raw[Symbol.iterator] === "function") {
				for (const tag of raw) add(tag);
			}
		} catch (error) {}

		return found;
	},

	collect() {
		this.items = [];

		const types = [
			this.runtime?.objects?.["Текст"],
			this.runtime?.objects?.Box
		];

		for (let t = 0; t < types.length; t++) {
			const type = types[t];

			if (!type || typeof type.getAllInstances !== "function") continue;

			const list = type.getAllInstances();

			for (let i = 0; i < list.length; i++) {
				const inst = list[i];
				const tags = this.tags(inst);

				if (tags.indexOf("menu") < 0) continue;

				const behavior = inst.behaviors?.["Перетаскивание"];

				if (behavior) {
					try {
						if (behavior.isDragging && typeof behavior.drop === "function") {
							behavior.drop();
						}

						behavior.isEnabled = false;
						behavior.enabled = false;
					} catch (error) {}
				}

				this.items.push({
					inst,
					tags
				});
			}
		}
	},

	bounds(inst) {
		try {
			const box = inst.getBoundingBox();

			if (box && box.right - box.left > 2 && box.bottom - box.top > 2) {
				return box;
			}
		} catch (error) {}

		const width = Math.abs(inst.width || 0);
		const height = Math.abs(inst.height || 0);
		const originX = typeof inst.originX === "number" ? inst.originX : 0;
		const originY = typeof inst.originY === "number" ? inst.originY : 0;

		return {
			left: inst.x - width * originX,
			right: inst.x + width * (1 - originX),
			top: inst.y - height * originY,
			bottom: inst.y + height * (1 - originY)
		};
	},

	hits() {
		const list = [];

		for (let i = 0; i < this.items.length; i++) {
			const item = this.items[i];

			if (item.tags.indexOf(this.screen) < 0) continue;
			if (item.tags.indexOf("hit") < 0) continue;
			if (!item.inst || item.inst.destroyed) continue;

			list.push(item);
		}

		return list;
	},

	hit(x, y) {
		const list = this.items;

		for (let i = list.length - 1; i >= 0; i--) {
			const item = list[i];

			if (item.tags.indexOf(this.screen) < 0) continue;
			if (!item.inst || item.inst.destroyed) continue;

			const clickable =
				item.tags.indexOf("hit") >= 0 ||
				item.tags.indexOf("slider-music-track") >= 0 ||
				item.tags.indexOf("slider-music-knob") >= 0 ||
				item.tags.indexOf("slider-sound-track") >= 0 ||
				item.tags.indexOf("slider-sound-knob") >= 0;

			if (!clickable) continue;

			try {
				if (
					typeof item.inst.containsPoint === "function" &&
					item.inst.containsPoint(x, y)
				) {
					return item;
				}
			} catch (error) {}

			const box = this.bounds(item.inst);

			if (
				x >= box.left - 12 &&
				x <= box.right + 12 &&
				y >= box.top - 12 &&
				y <= box.bottom + 12
			) {
				return item;
			}
		}

		return null;
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

	gameCanvas() {
		const list = document.querySelectorAll("canvas");
		let best = null;
		let area = 0;

		for (let i = 0; i < list.length; i++) {
			const box = list[i].getBoundingClientRect();
			const size = box.width * box.height;

			if (size > area) {
				area = size;
				best = list[i];
			}
		}

		return best;
	},

	layoutPoints(event) {
		const list = [];

		const push = (x, y) => {
			if (Number.isFinite(x) && Number.isFinite(y)) list.push({ x, y });
		};

		const layer = this.runtime?.layout?.getLayer?.(0);
		const canvas = this.gameCanvas();

		if (
			event &&
			canvas &&
			layer &&
			typeof layer.getViewport === "function" &&
			Number.isFinite(event.clientX)
		) {
			try {
				const rect = canvas.getBoundingClientRect();
				const view = layer.getViewport();
				const width = (view?.right ?? 0) - (view?.left ?? 0) || view?.width;
				const height = (view?.bottom ?? 0) - (view?.top ?? 0) || view?.height;

				if (rect.width > 2 && rect.height > 2 && width && height) {
					push(
						(view.left ?? 0) +
							((event.clientX - rect.left) / rect.width) * width,
						(view.top ?? 0) +
							((event.clientY - rect.top) / rect.height) * height
					);
				}
			} catch (error) {}
		}

		if (event && layer && typeof layer.cssPxToLayer === "function") {
			const rect = canvas?.getBoundingClientRect();
			const pairs = [
				[event.clientX, event.clientY],
				[event.pageX, event.pageY]
			];

			if (rect && Number.isFinite(event.clientX)) {
				pairs.push([event.clientX - rect.left, event.clientY - rect.top]);
			}

			for (let i = 0; i < pairs.length; i++) {
				if (!Number.isFinite(pairs[i][0]) || !Number.isFinite(pairs[i][1])) {
					continue;
				}

				try {
					const point = layer.cssPxToLayer(pairs[i][0], pairs[i][1]);

					if (Array.isArray(point)) push(point[0], point[1]);
					else if (point) push(point.x, point.y);
				} catch (error) {}
			}
		}

		const mouse = this.mousePoint();

		if (mouse) push(mouse.x, mouse.y);

		return list;
	},

	screenHit(event) {
		if (!event || !Number.isFinite(event.clientX)) return null;

		const layer = this.runtime?.layout?.getLayer?.(0);

		if (!layer || typeof layer.layerToCssPx !== "function") return null;

		const canvas = this.gameCanvas();
		const rect = canvas ? canvas.getBoundingClientRect() : null;
		const clicks = [
			[event.clientX, event.clientY],
			[event.pageX, event.pageY]
		];

		if (rect) clicks.push([event.clientX - rect.left, event.clientY - rect.top]);

		for (let i = this.items.length - 1; i >= 0; i--) {
			const item = this.items[i];

			if (item.tags.indexOf(this.screen) < 0) continue;
			if (!item.inst || item.inst.destroyed) continue;
			if (item.tags.indexOf("hit") < 0 && !this.sliderId(item.tags)) continue;

			let first;
			let second;

			try {
				const box = this.bounds(item.inst);

				first = layer.layerToCssPx(box.left, box.top);
				second = layer.layerToCssPx(box.right, box.bottom);
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
					return item;
				}
			}
		}

		return null;
	},

	pick(event) {
		const screenItem = this.screenHit(event);

		if (screenItem) {
			const box = this.bounds(screenItem.inst);

			return { item: screenItem, x: (box.left + box.right) / 2 };
		}

		const points = this.layoutPoints(event);

		for (let i = 0; i < points.length; i++) {
			const item = this.hit(points[i].x, points[i].y);

			if (item) return { item, x: points[i].x };
		}

		return null;
	},

	find(tag) {
		for (let i = 0; i < this.items.length; i++) {
			const item = this.items[i];

			if (item.tags.indexOf(this.screen) < 0) continue;
			if (item.tags.indexOf(tag) >= 0) return item;
		}

		return null;
	},

	volume(id) {
		if (id === "music") return globalThis.MusicManager?.volume ?? 0.35;

		return globalThis.SoundManager?.masterVolume ?? 1;
	},

	setVolume(id, value) {
		const next = Math.min(1, Math.max(0, value));

		if (id === "music") globalThis.MusicManager?.setVolume(next);
		else globalThis.SoundManager?.setMasterVolume(next);

		this.saveSettings();
		this.placeSliders();
	},

	sliderId(tags) {
		if (
			tags.indexOf("slider-music-track") >= 0 ||
			tags.indexOf("slider-music-knob") >= 0
		) {
			return "music";
		}

		if (
			tags.indexOf("slider-sound-track") >= 0 ||
			tags.indexOf("slider-sound-knob") >= 0
		) {
			return "sound";
		}

		return "";
	},

	trackBand(id) {
		const layer = this.runtime?.layout?.getLayer?.(0);
		const track = this.find("slider-" + id + "-track");

		if (!layer || !track || typeof layer.layerToCssPx !== "function") return null;

		let first;
		let second;

		try {
			const box = this.bounds(track.inst);
			const y = (box.top + box.bottom) / 2;

			first = layer.layerToCssPx(box.left, y);
			second = layer.layerToCssPx(box.right, y);
		} catch (error) {
			return null;
		}

		const ax = first?.x ?? first?.[0];
		const ay = first?.y ?? first?.[1];
		const bx = second?.x ?? second?.[0];
		const by = second?.y ?? second?.[1];

		if (![ax, ay, bx, by].every(Number.isFinite)) return null;

		return {
			left: Math.min(ax, bx),
			right: Math.max(ax, bx),
			top: Math.min(ay, by),
			bottom: Math.max(ay, by)
		};
	},

	sliderAt(event) {
		if (!event || !Number.isFinite(event.clientX)) return null;

		const ids = ["music", "sound"];

		for (let i = 0; i < ids.length; i++) {
			const band = this.trackBand(ids[i]);

			if (!band) continue;

			const width = Math.max(1, band.right - band.left);
			const x = event.clientX;
			const y = event.clientY;

			if (
				x >= band.left - 18 &&
				x <= band.right + 18 &&
				y >= band.top - 42 &&
				y <= band.bottom + 42
			) {
				return { id: ids[i], amount: (x - band.left) / width };
			}
		}

		const point = this.layoutPoints(event)[0];

		if (!point) return null;

		for (let i = 0; i < ids.length; i++) {
			const track = this.find("slider-" + ids[i] + "-track");

			if (!track) continue;

			const box = this.bounds(track.inst);

			if (
				point.x >= box.left - 18 &&
				point.x <= box.right + 18 &&
				point.y >= box.top - 42 &&
				point.y <= box.bottom + 42
			) {
				const width = Math.max(1, box.right - box.left);

				return { id: ids[i], amount: (point.x - box.left) / width };
			}
		}

		return null;
	},

	sliderAmount(id, event) {
		const band = this.trackBand(id);

		if (band && event && Number.isFinite(event.clientX)) {
			const width = Math.max(1, band.right - band.left);

			return (event.clientX - band.left) / width;
		}

		const point = this.layoutPoints(event)[0];
		const track = this.find("slider-" + id + "-track");

		if (!point || !track) return null;

		const box = this.bounds(track.inst);
		const width = Math.max(1, box.right - box.left);

		return (point.x - box.left) / width;
	},

	placeSliders() {
		const ids = ["music", "sound"];

		for (let i = 0; i < ids.length; i++) {
			const id = ids[i];
			const track = this.find("slider-" + id + "-track");
			const knob = this.find("slider-" + id + "-knob");
			const label = this.find("slider-" + id + "-value");

			if (!track?.inst) continue;

			const box = this.bounds(track.inst);
			const amount = this.volume(id);

			if (knob?.inst) {
				knob.inst.x = box.left + (box.right - box.left) * amount;
				knob.inst.y = (box.top + box.bottom) / 2;
			}

			if (label?.inst && "text" in label.inst) {
				label.inst.text = Math.round(amount * 100) + "%";
			}
		}
	},

	show(screen) {
		this.screen = screen;
		this.cursor = 0;
		this.drag = "";
		this.downId = null;

		for (let i = 0; i < this.items.length; i++) {
			const item = this.items[i];
			const inst = item.inst;

			if (!inst || inst.destroyed) continue;

			const on = item.tags.indexOf(screen) >= 0;

			inst.isVisible = on;
			inst.opacity = on ? 1 : 0;
		}

		this.placeSliders();
		this.paint();
	},

	paint() {
		const list = this.hits();

		for (let i = 0; i < list.length; i++) {
			const inst = list[i].inst;

			if (!inst || !("fontColor" in inst)) continue;

			inst.fontColor = (i === this.cursor ? this.hot : this.idle).slice();
		}
	},

	activate(item) {
		const tags = item.tags;

		if (tags.indexOf("go-play") >= 0) this.show("play");
		else if (tags.indexOf("go-settings") >= 0) this.show("settings");
		else if (tags.indexOf("go-levels") >= 0) this.show("levels");
		else if (tags.indexOf("go-home") >= 0) this.show("home");
		else if (tags.indexOf("go-start") >= 0) this.go("Level1");
		else if (tags.indexOf("go-exit") >= 0) {
			try {
				globalThis.close();
			} catch (error) {}
		} else {
			for (let i = 0; i < tags.length; i++) {
				if (tags[i].indexOf("level-") !== 0) continue;

				this.go("Level" + tags[i].slice(6));

				return;
			}
		}
	},

	go(layout) {
		if (!this.runtime) return;

		this.open = false;
		this.drag = "";
		this.downId = null;
		this.runtime.goToLayout(layout);
	},

	start(runtime) {
		if (!runtime?.layout || runtime.layout.name !== "Menu") return;

		this.runtime = runtime;
		this.drag = "";
		this.downId = null;

		globalThis.PauseManager?.close?.();
		globalThis.GameOverManager?.dismiss?.();
		globalThis.TransitionManager?.reset?.();

		if ("timeScale" in runtime) runtime.timeScale = 1;

		const layer = runtime.layout.getLayer?.(0);

		if (layer) {
			layer.scale = 1;

			if (typeof layer.scrollTo === "function") {
				layer.scrollTo(runtime.layout.width / 2, runtime.layout.height / 2);
			}
		}

		this.collect();

		if (!this.items.length) {
			this.open = false;
			return;
		}

		this.open = true;
		this.loadSettings();
		this.show("home");
		globalThis.MusicManager?.start(runtime, "bgm.webm");
	},

	dismiss() {
		this.open = false;
		this.drag = "";
		this.downId = null;
		this.items = [];
		this.cursor = 0;
		this.tries = 0;
	},

	tick() {
		if (this.runtime?.layout?.name !== "Menu") return;
		if (this.open && this.items.length) return;
		if (this.tries > 30) return;

		this.tries += 1;
		this.start(this.runtime);
	},

	onDown(event) {
		if (this.runtime?.layout?.name !== "Menu") return;
		if (!this.open || !this.items.length) this.start(this.runtime);
		if (!this.open) return;

		const slider = this.sliderAt(event);

		if (slider) {
			this.drag = slider.id;
			this.setVolume(slider.id, slider.amount);
			return;
		}

		this.drag = "";
	},

	onMove(event) {
		if (this.runtime?.layout?.name !== "Menu" || !this.open) return;

		if (this.drag) {
			const amount = this.sliderAmount(this.drag, event);

			if (amount != null) this.setVolume(this.drag, amount);

			return;
		}

		const picked = this.pick(event);

		if (!picked) return;

		const list = this.hits();
		const index = list.indexOf(picked.item);

		if (index < 0 || index === this.cursor) return;

		this.cursor = index;
		this.paint();
	},

	onUp(event) {
		if (this.runtime?.layout?.name !== "Menu") return;
		if (!this.open || !this.items.length) this.start(this.runtime);
		if (!this.open) return;

		if (this.drag) {
			const amount = this.sliderAmount(this.drag, event);

			if (amount != null) this.setVolume(this.drag, amount);

			this.drag = "";
			this.lastAct = Date.now();
			return;
		}

		const picked = this.pick(event);

		if (!picked || picked.item.tags.indexOf("hit") < 0) return;

		const now = Date.now();

		if (now - this.lastAct < 120) return;

		this.lastAct = now;
		this.activate(picked.item);
	},

	onKey(event) {
		if (!this.open || event.repeat || this.runtime?.layout?.name !== "Menu") {
			return;
		}

		const code = (event.code || "").toLowerCase();
		const key = (event.key || "").toLowerCase();
		const list = this.hits();

		if (code === "escape" || key === "escape" || key === "esc") {
			if (this.screen === "levels") this.show("play");
			else if (this.screen !== "home") this.show("home");

			return;
		}

		if (!list.length) return;

		if (code === "arrowup" || code === "keyw") {
			this.cursor = (this.cursor - 1 + list.length) % list.length;
			this.paint();
			return;
		}

		if (code === "arrowdown" || code === "keys") {
			this.cursor = (this.cursor + 1) % list.length;
			this.paint();
			return;
		}

		if (
			code === "enter" ||
			code === "numpadenter" ||
			code === "space"
		) {
			const item = list[this.cursor];

			if (item) this.activate(item);
		}
	}
};

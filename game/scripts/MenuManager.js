globalThis.MenuManager = {
	runtime: null,
	open: false,
	screen: "home",
	items: [],
	phase: "",
	from: "",
	next: "",
	cutTime: 0,
	slashInst: null,
	cursor: 0,
	downId: null,
	drag: null,
	bound: false,
	idle: [0.62, 0.64, 0.66],
	hot: [0.97, 0.96, 0.93],

	bind(runtime) {
		if (this.bound) return;
		this.bound = true;
		this.runtime = runtime;
		runtime.addEventListener("tick", () => this.tick());
		runtime.addEventListener("pointerdown", () => this.onDown());
		runtime.addEventListener("pointerup", () => this.onUp());
		runtime.addEventListener("pointermove", () => this.onMove());
		runtime.addEventListener("keydown", (event) => this.onKey(event));
		globalThis.addEventListener("keydown", (event) => this.onKey(event), true);
	},

	loadSettings() {
		try {
			const music = localStorage.getItem("norm.music");
			const sound = localStorage.getItem("norm.sound");
			if (music != null && music !== "") globalThis.MusicManager?.setVolume(Number(music));
			if (sound != null && sound !== "") globalThis.SoundManager?.setMasterVolume(Number(sound));
		} catch (error) {
			// Storage can be blocked. Sliders still change the live volume.
		}
	},

	saveSettings() {
		try {
			localStorage.setItem("norm.music", String(globalThis.MusicManager?.volume ?? 0.35));
			localStorage.setItem("norm.sound", String(globalThis.SoundManager?.masterVolume ?? 1));
		} catch (error) {
			// The volume stays applied until the page is closed.
		}
	},

	tags(inst) {
		const found = [];
		if (!inst) return found;
		if (typeof inst.getAllTags === "function") {
			for (const tag of inst.getAllTags()) found.push(String(tag).toLowerCase());
		}
		const raw = inst.tags ?? inst.tag ?? "";
		if (typeof raw === "string") {
			for (const tag of raw.split(/\s+/)) if (tag) found.push(tag.toLowerCase());
		}
		return found;
	},

	has(tags, tag) {
		return tags.includes(tag);
	},

	collect() {
		this.items = [];
		const types = [
			this.runtime.objects["Текст"],
			this.runtime.objects.Box
		];
		for (let t = 0; t < types.length; t++) {
			const type = types[t];
			if (!type || typeof type.getAllInstances !== "function") continue;
			const list = type.getAllInstances();
			for (let i = 0; i < list.length; i++) {
				const inst = list[i];
				const tags = this.tags(inst);
				if (!this.has(tags, "menu")) continue;
				this.items.push({
					inst,
					tags,
					x: inst.x,
					y: inst.y,
					w: inst.width || 0
				});
			}
		}
	},

	hits() {
		const list = [];
		for (let i = 0; i < this.items.length; i++) {
			const item = this.items[i];
			if (!this.has(item.tags, this.screen)) continue;
			if (!this.has(item.tags, "hit") && !this.has(item.tags, "slider-music-track") && !this.has(item.tags, "slider-sound-track")) continue;
			list.push(item);
		}
		return list;
	},

	show(inst, on) {
		if (!inst) return;
		inst.isVisible = on;
		if ("visible" in inst) inst.visible = on;
		if (!on) inst.opacity = 0;
	},

	easeOutBack(t) {
		const c1 = 1.2;
		const c3 = c1 + 1;
		const p = t - 1;
		return 1 + c3 * p * p * p + c1 * p * p;
	},

	screenItems(screen) {
		const list = [];
		for (let i = 0; i < this.items.length; i++) {
			if (this.has(this.items[i].tags, screen)) list.push(this.items[i]);
		}
		list.sort((a, b) => a.y - b.y || a.x - b.x);
		return list;
	},

	baseX(item) {
		const id = this.sliderId(item.tags);
		if (!id || !this.has(item.tags, "slider-" + id + "-knob")) return item.x;
		for (let i = 0; i < this.items.length; i++) {
			const track = this.items[i];
			if (!this.has(track.tags, "slider-" + id + "-track")) continue;
			return track.x + this.volumeOf(id) * (track.w || 340);
		}
		return item.x;
	},

	place(item, shift, opacity) {
		const inst = item.inst;
		if (!inst) return;
		const visible = opacity > 0.03;
		inst.isVisible = visible;
		if ("visible" in inst) inst.visible = visible;
		inst.opacity = Math.min(1, Math.max(0, opacity));
		inst.x = this.baseX(item) + shift;
		inst.y = item.y;
	},

	hideScreen(screen) {
		const list = this.screenItems(screen);
		for (let i = 0; i < list.length; i++) this.place(list[i], 0, 0);
	},

	ensureSlash() {
		if (this.slashInst) return;
		const type = this.runtime?.objects?.Box;
		const layer = this.runtime?.layout?.getLayer(0);
		if (!type || !layer) return;
		const ref = typeof layer.index === "number" ? layer.index : 0;
		const inst = type.createInstance(ref, 140, 420);
		try {
			if (typeof inst.setAnimation === "function") inst.setAnimation("SquareBlue");
		} catch (error) {
			// The cut still reads as a thin bar.
		}
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
		inst.isVisible = false;
		inst.opacity = 0;
		inst.width = 5;
		inst.height = 8;
		if (typeof inst.moveToTop === "function") inst.moveToTop();
		this.slashInst = inst;
	},

	moveSlash(mode, t) {
		const bar = this.slashInst;
		if (!bar) return;
		const amount = Math.min(1, Math.max(0, t));
		bar.isVisible = amount > 0.02;
		if (typeof bar.moveToTop === "function") bar.moveToTop();
		if (mode === "out") {
			const height = 28 + 700 * amount;
			bar.opacity = 1;
			bar.width = 7;
			bar.height = height;
			bar.x = 138;
			bar.y = 96 + height / 2;
			return;
		}
		const height = 728 * (1 - amount);
		bar.opacity = 1 - amount;
		bar.width = 4;
		bar.height = Math.max(2, height);
		bar.x = 138;
		bar.y = 96 + height / 2;
		if (amount >= 1) bar.isVisible = false;
	},

	beginIn(screen) {
		this.screen = screen;
		this.phase = "in";
		this.cutTime = 0;
		this.cursor = 0;
		const list = this.screenItems(screen);
		for (let i = 0; i < list.length; i++) this.place(list[i], 78, 0);
		this.ensureSlash();
	},

	showScreen(screen) {
		if (!screen || screen === this.screen || this.phase) return;
		this.from = this.screen;
		this.next = screen;
		this.phase = "out";
		this.cutTime = 0;
		this.cursor = 0;
		this.drag = null;
		this.downId = null;
		this.ensureSlash();
	},

	stepCut(dt) {
		this.cutTime += dt;
		if (this.phase === "out") {
			const t = Math.min(1, this.cutTime / 0.14);
			const list = this.screenItems(this.from);
			for (let i = 0; i < list.length; i++) this.place(list[i], -64 * t * t, 1 - t);
			this.moveSlash("out", t);
			if (t < 1) return;
			this.hideScreen(this.from);
			this.beginIn(this.next);
			return;
		}

		if (this.phase !== "in") return;
		const list = this.screenItems(this.screen);
		let done = list.length === 0;
		if (list.length) done = true;
		for (let i = 0; i < list.length; i++) {
			const delay = Math.min(i * 0.02, 0.16);
			const local = (this.cutTime - delay) / 0.28;
			if (local <= 0) {
				done = false;
				this.place(list[i], 78, 0);
				continue;
			}
			const t = Math.min(1, local);
			if (t < 1) done = false;
			const eased = this.easeOutBack(t);
			const fade = Math.min(1, t * 2.6);
			this.place(list[i], (1 - eased) * 78, fade);
		}
		this.moveSlash("in", Math.min(1, this.cutTime / 0.42));
		if (!done) return;
		this.phase = "";
		this.from = "";
		this.next = "";
		this.moveSlash("in", 1);
		this.placeSliders();
		this.paint();
	},

	start(runtime) {
		this.runtime = runtime;
		this.open = true;
		const layer = runtime.layout.getLayer(0);
		if (layer && typeof layer.scrollTo === "function") {
			layer.scrollTo(runtime.layout.width / 2, runtime.layout.height / 2);
		}
		this.collect();
		for (let i = 0; i < this.items.length; i++) this.place(this.items[i], 0, 0);
		this.beginIn("home");
		globalThis.MusicManager?.start(runtime, "bgm.webm");
	},

	dismiss() {
		this.open = false;
		this.phase = "";
		this.drag = null;
		this.downId = null;
		this.items = [];
		if (this.slashInst) {
			try {
				this.slashInst.destroy();
			} catch (error) {
				// The layout change already removed the cut.
			}
			this.slashInst = null;
		}
	},

	volumeOf(id) {
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

	sliderParts(id) {
		let track = null;
		let knob = null;
		let value = null;
		const trackTag = "slider-" + id + "-track";
		const knobTag = "slider-" + id + "-knob";
		const valueTag = "slider-" + id + "-value";
		for (let i = 0; i < this.items.length; i++) {
			const item = this.items[i];
			if (!this.has(item.tags, "settings")) continue;
			if (this.has(item.tags, trackTag)) track = item.inst;
			if (this.has(item.tags, knobTag)) knob = item.inst;
			if (this.has(item.tags, valueTag)) value = item.inst;
		}
		return { track, knob, value };
	},

	placeSliders() {
		for (const id of ["music", "sound"]) {
			const parts = this.sliderParts(id);
			const amount = this.volumeOf(id);
			if (parts.value) {
				try {
					parts.value.text = Math.round(amount * 100) + "%";
				} catch (error) {
					// The number is decorative if the text setter is not ready.
				}
			}
			if (!parts.track || !parts.knob) continue;
			const box = parts.track.getBoundingBox();
			const width = Math.max(1, box.right - box.left);
			parts.knob.x = box.left + amount * width;
			parts.knob.y = (box.top + box.bottom) / 2;
		}
	},

	paint() {
		const hits = this.hits();
		if (this.cursor >= hits.length) this.cursor = 0;
		for (let i = 0; i < hits.length; i++) {
			const inst = hits[i].inst;
			if (!inst || !("fontColor" in inst)) continue;
			const on = i === this.cursor && this.has(hits[i].tags, "hit");
			inst.fontColor = (on ? this.hot : this.idle).slice();
		}
	},

	bounds(inst) {
		const box = inst.getBoundingBox();
		return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
	},

	at(x, y) {
		const hits = this.hits();
		for (let i = hits.length - 1; i >= 0; i--) {
			const item = hits[i];
			const box = this.bounds(item.inst);
			const pad = this.has(item.tags, "hit") ? 6 : 18;
			if (x >= box.left - 12 && x <= box.right + 12 && y >= box.top - pad && y <= box.bottom + pad) {
				return { item, index: i, box };
			}
		}
		return null;
	},

	pointer() {
		const mouse = this.runtime?.mouse;
		if (!mouse || typeof mouse.getMouseX !== "function") return null;
		return { x: mouse.getMouseX(0), y: mouse.getMouseY(0) };
	},

	sliderId(tags) {
		if (this.has(tags, "slider-music-track") || this.has(tags, "slider-music-knob")) return "music";
		if (this.has(tags, "slider-sound-track") || this.has(tags, "slider-sound-knob")) return "sound";
		return "";
	},

	activate(item) {
		const tags = item.tags;
		if (this.has(tags, "go-play")) this.showScreen("play");
		else if (this.has(tags, "go-settings")) this.showScreen("settings");
		else if (this.has(tags, "go-levels")) this.showScreen("levels");
		else if (this.has(tags, "go-home")) this.showScreen("home");
		else if (this.has(tags, "go-start")) this.go("Level1");
		else if (this.has(tags, "go-exit")) this.exit();
		else {
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
		this.runtime.goToLayout(layout);
	},

	exit() {
		try {
			globalThis.close();
		} catch (error) {
			// A preview tab is allowed to ignore close.
		}
	},

	tick() {
		if (!this.open || this.runtime?.layout?.name !== "Menu") return;
		if (this.phase) {
			this.stepCut(Math.min(this.runtime.dt || 0, 0.05));
			return;
		}
		const point = this.pointer();
		if (!point) return;
		if (this.drag) {
			const parts = this.sliderParts(this.drag);
			if (parts.track) {
				const box = this.bounds(parts.track);
				const width = Math.max(1, box.right - box.left);
				this.setVolume(this.drag, (point.x - box.left) / width);
			}
		}
		const found = this.at(point.x, point.y);
		if (!found || found.index === this.cursor) return;
		this.cursor = found.index;
		this.paint();
	},

	onDown() {
		if (!this.open || this.phase || this.runtime?.layout?.name !== "Menu") return;
		const point = this.pointer();
		if (!point) return;
		const found = this.at(point.x, point.y);
		this.downId = found ? found.item.inst.uid : null;
		const slider = found ? this.sliderId(found.item.tags) : "";
		if (!slider || !found) return;
		this.drag = slider;
		const width = Math.max(1, found.box.right - found.box.left);
		this.setVolume(slider, (point.x - found.box.left) / width);
	},

	onMove() {
		if (!this.open || !this.drag) return;
		this.tick();
	},

	onUp() {
		if (!this.open || this.phase || this.runtime?.layout?.name !== "Menu") return;
		const point = this.pointer();
		const found = point ? this.at(point.x, point.y) : null;
		if (!this.drag && found && this.has(found.item.tags, "hit") && found.item.inst.uid === this.downId) {
			this.activate(found.item);
		}
		this.drag = null;
		this.downId = null;
	},

	onKey(event) {
		if (!this.open || this.phase || event.repeat || this.runtime?.layout?.name !== "Menu") return;
		const code = (event.code || "").toLowerCase();
		const key = (event.key || "").toLowerCase();
		const hits = this.hits();
		const current = hits[this.cursor];

		if (code === "escape" || key === "escape" || key === "esc") {
			const now = Date.now();
			if (now - (this.lastEsc || 0) < 180) return;
			this.lastEsc = now;
			if (this.screen === "levels") this.showScreen("play");
			else if (this.screen !== "home") this.showScreen("home");
			return;
		}

		const slider = current ? this.sliderId(current.tags) : "";
		if (slider && (code === "arrowleft" || code === "keya" || code === "arrowright" || code === "keyd")) {
			const step = code === "arrowright" || code === "keyd" ? 0.05 : -0.05;
			this.setVolume(slider, this.volumeOf(slider) + step);
			return;
		}

		if (!hits.length) return;

		if (code === "arrowup" || code === "keyw") {
			this.cursor = (this.cursor - 1 + hits.length) % hits.length;
			this.paint();
			return;
		}

		if (code === "arrowdown" || code === "keys") {
			this.cursor = (this.cursor + 1) % hits.length;
			this.paint();
			return;
		}

		if ((code === "enter" || code === "numpadenter" || code === "space") && current && this.has(current.tags, "hit")) {
			this.activate(current);
		}
	}
};

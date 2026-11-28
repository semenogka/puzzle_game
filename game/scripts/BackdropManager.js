globalThis.BackdropManager = {
	bound: false,
	pieces: [],
	delay: {
		"bg-sky": 0,
		"bg-cloud": 0.18,
		"bg-far": 0.46,
		"bg-main": 0.78,
		"bg-fog": 1.22
	},

	bind(runtime) {
		if (this.bound) return;
		this.bound = true;
		this.runtime = runtime;
		runtime.addEventListener("layoutstart", () => this.begin());
		runtime.addEventListener("tick", () => this.step());
	},

	clear() {
		this.pieces = [];
	},

	tags(inst) {
		const raw = inst.tags ?? inst.tag ?? "";
		if (Array.isArray(raw)) return raw.join(" ");
		return String(raw);
	},

	part(inst) {
		const text = this.tags(inst);
		const names = ["bg-sky", "bg-cloud", "bg-far", "bg-main", "bg-fog"];
		for (const name of names) {
			if (text.indexOf(name) !== -1) return name;
		}
		return "";
	},

	async begin() {
		this.pieces = [];
		const name = this.runtime.layout?.name || "";
		const match = /^Level(\d+)$/.exec(name);
		const level = match ? Number(match[1]) : 0;
		if (level < 1 || level > 6) return;
		const type = this.runtime.objects.Backdrop;
		if (!type || typeof type.getAllInstances !== "function") return;
		const list = type.getAllInstances();
		for (const inst of list) {
			const part = this.part(inst);
			if (!part) continue;
			inst.isVisible = true;
			inst.opacity = 0;
			this.pieces.push({
				inst,
				delay: this.delay[part],
				time: 0
			});
		}
	},

	step() {
		if (!this.pieces.length) return;
		if (globalThis.PauseManager?.paused) return;
		const dt = this.runtime.dt || 0;
		for (const piece of this.pieces) {
			piece.time += dt;
			const t = Math.min(1, Math.max(0, (piece.time - piece.delay) / 0.6));
			const eased = t * t * (3 - 2 * t);
			piece.inst.opacity = eased;
			piece.inst.isVisible = true;
		}
	}
};

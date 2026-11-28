globalThis.SpikeManager = {
	active: false,
	layoutName: "",
	spikes: [],

	isSpike(inst) {
		if (!inst) return false;
		if (typeof inst.hasTag === "function" && inst.hasTag("spike")) return true;
		if (typeof inst.getAllTags === "function") {
			for (const tag of inst.getAllTags()) {
				if (String(tag).toLowerCase() === "spike") return true;
			}
		}
		const raw = inst.tags ?? inst.tag;
		if (typeof raw === "string") {
			const parts = raw.toLowerCase().split(/\s+/);
			for (let i = 0; i < parts.length; i++) {
				if (parts[i] === "spike") return true;
			}
		}
		return false;
	},

	touches(a, b) {
		if (!a || !b) return false;

		const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
		const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);

		if (ox > 4 && oy > 4) return true;

		const down = a.bottom - b.top;
		if (ox > 4 && down >= -12 && down <= 36) return true;

		const up = b.bottom - a.top;
		if (ox > 4 && up >= -12 && up <= 36) return true;

		const right = a.right - b.left;
		if (right >= -12 && right <= 36 && oy > 4) return true;

		const left = b.right - a.left;
		if (left >= -12 && left <= 36 && oy > 4) return true;

		return false;
	},

	release() {
		this.active = false;
		this.layoutName = "";
		this.spikes = [];
	},

	initialize(runtime) {
		this.release();
		const grounds = runtime.objects.Ground?.getAllInstances?.() || [];
		for (let i = 0; i < grounds.length; i++) {
			const inst = grounds[i];
			if (this.isSpike(inst)) this.spikes.push(inst);
		}
		this.layoutName = runtime.layout?.name || "";
		this.active = true;
	},

	hit(player) {
		const bounds = player.getBoundingBox();
		for (let i = 0; i < this.spikes.length; i++) {
			const spike = this.spikes[i];
			if (!spike || spike.destroyed) continue;
			if (this.touches(bounds, spike.getBoundingBox())) return true;
		}
		return false;
	},

	kill(runtime, player) {
		globalThis.EffectManager?.spike(runtime, player);
		const manager = globalThis.GameOverManager;
		const playerManager = globalThis.PlayerManager;
		if (playerManager) {
			playerManager.velocityX = 0;
			playerManager.velocityY = 0;
		}
		if (manager && !manager.active) manager.show(runtime, player, "Шипы");
	},

	update(runtime, player) {
		if (!this.active || !player || player.destroyed) return null;
		if (this.layoutName && runtime.layout?.name && this.layoutName !== runtime.layout.name) return null;
		if (!this.hit(player)) return null;
		this.kill(runtime, player);
		return "spike";
	}
};

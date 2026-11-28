globalThis.PuzzleManager = {
	initialize(runtime) {
		globalThis.SpikeManager?.initialize(runtime);
		globalThis.ButtonManager?.initialize(runtime);
	},

	update(runtime, player, dt) {
		if (globalThis.SpikeManager?.update(runtime, player, dt)) return "spike";
		globalThis.ButtonManager?.update(runtime, player, dt);
		return null;
	},

	release() {
		globalThis.SpikeManager?.release();
		globalThis.ButtonManager?.release();
	}
};

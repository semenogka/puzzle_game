globalThis.RestartManager = {
	runtime: null,
	bound: false,

	bind(runtime) {
		if (this.bound) return;
		this.bound = true;
		this.runtime = runtime;
		runtime.addEventListener("keydown", (event) => {
			if (event.repeat) return;
			const code = (event.code || "").toLowerCase();
			const key = (event.key || "").toLowerCase();
			if (code !== "keyr" && key !== "r") return;
			this.restart(runtime);
		});
	},

	restart(runtime) {
		const current = runtime || this.runtime;
		const name = current?.layout?.name;
		if (!current || !name || name === "Menu") return;

		globalThis.PauseManager?.close();
		globalThis.GameOverManager?.dismiss();

		const transition = globalThis.TransitionManager;
		if (transition) {
			transition.pendingEntry = false;
			if (typeof transition.reset === "function") transition.reset();
		}

		const playerManager = globalThis.PlayerManager;
		if (playerManager) {
			playerManager.crushed = false;
			playerManager.velocityX = 0;
			playerManager.velocityY = 0;
		}

		current.goToLayout(name);
		if (globalThis.PauseManager) globalThis.PauseManager.paused = false;
	}
};

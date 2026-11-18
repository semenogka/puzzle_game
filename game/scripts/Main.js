import "./PlayerManager.js";
import "./BoxManager.js";
import "./FrameManager.js";
import "./FakeBoxManager.js";
import "./MusicManager.js";
import "./SoundManager.js";
import "./TransitionManager.js";
import "./GravityManager.js";
import "./GameOverManager.js";

globalThis.RuntimeLoop = {
	tick: null,

	set(tick) {
		this.tick = tick;
	},

	bind(runtime) {
		if (this.bound) return;
		this.bound = true;
		runtime.addEventListener("tick", () => {
			const tick = this.tick;
			if (tick) tick();
		});
	}
};

runOnStartup(runtime => {
	runtime.addEventListener("beforeprojectstart", () => {
		globalThis.MusicManager.initialize(runtime);
		globalThis.SoundManager.initialize(runtime);
		globalThis.GameOverManager.initialize(runtime);
		globalThis.TransitionManager.bind(runtime);
		globalThis.RuntimeLoop.bind(runtime);

		runtime.addEventListener("beforelayoutstart", () => {
			globalThis.RuntimeLoop.tick = null;
			globalThis.GravityManager.release();
			globalThis.BoxManager.reset();
			globalThis.FakeBoxManager.reset();
		});
	});
});
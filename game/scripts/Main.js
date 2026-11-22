import "./PlayerManager.js";
import "./BoxManager.js";
import "./FrameManager.js";
import "./FakeBoxManager.js";
import "./MusicManager.js";
import "./SoundManager.js";
import "./TransitionManager.js";
import "./GravityManager.js";
import "./GameOverManager.js";
import "./FallManager.js";
import "./EffectManager.js";
import "./SpikeManager.js";
import "./ButtonManager.js";
import "./PuzzleManager.js";
import "./CrushManager.js";
import "./MenuManager.js";
import "./PauseManager.js";
import "./RestartManager.js";
import "./GlassesManager.js";

globalThis.RuntimeLoop = {
	tick: null,

	set(tick) {
		this.tick = tick;
	},

	bind(runtime) {
		if (this.bound) return;
		this.bound = true;
		runtime.addEventListener("tick", () => {
			if (globalThis.PauseManager?.paused) {
				globalThis.PauseManager.tick();
				return;
			}
			const tick = this.tick;
			if (tick) tick();
		});
	}
};

runOnStartup(runtime => {
	runtime.addEventListener("beforeprojectstart", () => {
		globalThis.MenuManager.loadSettings();
		globalThis.MusicManager.initialize(runtime);
		globalThis.SoundManager.initialize(runtime);
		globalThis.GameOverManager.initialize(runtime);
		globalThis.TransitionManager.bind(runtime);
		globalThis.EffectManager.bind(runtime);
		globalThis.RuntimeLoop.bind(runtime);
		globalThis.MenuManager.bind(runtime);
		globalThis.PauseManager.bind(runtime);
		globalThis.RestartManager.bind(runtime);

		runtime.addEventListener("beforelayoutstart", () => {
			globalThis.MenuManager.dismiss();
			globalThis.PauseManager.close();
			globalThis.RuntimeLoop.tick = null;
			globalThis.GravityManager.release();
			globalThis.EffectManager.release();
			globalThis.SpikeManager.release();
			globalThis.ButtonManager.release();
			globalThis.PuzzleManager.release();
			globalThis.BoxManager.reset();
			globalThis.FakeBoxManager.reset();
		});
	});
});
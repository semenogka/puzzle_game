import "./PlayerManager.js";
import "./BoxManager.js";
import "./FrameManager.js";
import "./FakeBoxManager.js";
import "./MusicManager.js";
import "./SoundManager.js";
import "./TransitionManager.js";

runOnStartup(runtime => {
	runtime.addEventListener("beforeprojectstart", () => {
		globalThis.MusicManager.initialize(runtime);
		globalThis.SoundManager.initialize(runtime);
	});
});
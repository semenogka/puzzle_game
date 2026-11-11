globalThis.MusicManager = {
	runtime: null,
	audio: null,
	started: false,
	currentTrack: null,
	unlockAttached: false,
	unlockHandler: null,
	volume: 0.35,
	defaultTrack: "bgm.webm",
	fadeToken: 0,

	initialize(runtime) {
		if (this.runtime === runtime) return;
		this.runtime = runtime;
		this.attachUnlockListeners();
	},

	async start(runtime, trackName = this.defaultTrack, options = {}) {
		if (runtime) this.runtime = runtime;
		if (!this.runtime?.assets) return;

		const track = trackName || this.defaultTrack;
		if (this.started && this.currentTrack === track && this.audio && !this.audio.paused) {
			return;
		}

		if (this.audio && this.currentTrack && this.currentTrack !== track) {
			await this.fadeOut(options.fadeOutDuration ?? 0.5);
		}

		this.started = true;
		this.currentTrack = track;
		this.attachUnlockListeners();

		try {
			const url = await this.runtime.assets.getMediaFileUrl(track);
			const audio = new Audio(url);
			audio.loop = true;
			audio.preload = "auto";
			audio.volume = options.volume ?? this.volume;
			audio.addEventListener("error", () => {
				console.error("MusicManager: failed to load music", track);
			});
			this.audio = audio;
			audio.load();
			this.play();
		} catch (error) {
			console.error("MusicManager: failed to load music", track, error);
		}
	},

	play() {
		if (!this.audio) return;

		try {
			const promise = this.audio.play();
			if (promise?.then) {
				promise.then(() => {
					this.removeUnlockListeners();
				}).catch(() => {
					this.attachUnlockListeners();
				});
			}
		} catch (error) {
			this.attachUnlockListeners();
		}
	},

	async fadeOut(duration = 0.5) {
		if (!this.audio) return;
		const audio = this.audio;
		const startVolume = audio.volume;
		const token = ++this.fadeToken;
		const steps = 20;
		const stepTime = Math.max(16, (duration * 1000) / steps);

		for (let i = 1; i <= steps; i++) {
			if (token !== this.fadeToken || this.audio !== audio) return;
			audio.volume = Math.max(0, startVolume * (1 - i / steps));
			await new Promise(resolve => setTimeout(resolve, stepTime));
		}

		if (token !== this.fadeToken || this.audio !== audio) return;
		audio.pause();
		audio.currentTime = 0;
		audio.volume = startVolume;
		if (this.audio === audio) this.audio = null;
	},

	async stop(duration = 0) {
		if (duration > 0) {
			await this.fadeOut(duration);
		} else if (this.audio) {
			this.audio.pause();
			this.audio.currentTime = 0;
		}
		this.started = false;
		this.currentTrack = null;
	},

	attachUnlockListeners() {
		if (this.unlockAttached) return;
		this.unlockAttached = true;
		this.unlockHandler = () => {
			this.play();
		};
		globalThis.addEventListener("pointerdown", this.unlockHandler, true);
		globalThis.addEventListener("keydown", this.unlockHandler, true);
		globalThis.addEventListener("touchstart", this.unlockHandler, true);
		globalThis.addEventListener("touchend", this.unlockHandler, true);
		globalThis.addEventListener("click", this.unlockHandler, true);
	},

	removeUnlockListeners() {
		if (!this.unlockHandler) {
			this.unlockAttached = false;
			return;
		}
		globalThis.removeEventListener("pointerdown", this.unlockHandler, true);
		globalThis.removeEventListener("keydown", this.unlockHandler, true);
		globalThis.removeEventListener("touchstart", this.unlockHandler, true);
		globalThis.removeEventListener("touchend", this.unlockHandler, true);
		globalThis.removeEventListener("click", this.unlockHandler, true);
		this.unlockHandler = null;
		this.unlockAttached = false;
	}
};
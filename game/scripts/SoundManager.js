globalThis.SoundManager = {
	runtime: null,
	sounds: new Map(),
	active: new Set(),
	loops: new Map(),
	masterVolume: 1,
	defaultVolume: 0.7,
	soundFiles: {
		run: "run.webm",
		jump: "jump.webm",
		frameFill: "frameFills.webm",
		frameFall: "frameFall.webm"
	},

	async initialize(runtime, files = {}) {
		if (this.runtime === runtime && this.sounds.size > 0) return;
		this.runtime = runtime;
		this.soundFiles = { ...this.soundFiles, ...files };
		await this.loadAll();
	},

	register(name, fileName, volume = this.defaultVolume) {
		if (!this.sounds.has(name)) {
			this.sounds.set(name, {
				fileName,
				url: null,
				volume,
				loaded: false
			});
		} else {
			const sound = this.sounds.get(name);
			sound.fileName = fileName;
			sound.volume = volume;
			sound.loaded = false;
			sound.url = null;
		}
	},

	async load(name, fileName = null, volume = null) {
		if (!this.runtime?.assets) return null;
		if (!this.sounds.has(name)) {
			this.register(name, fileName || name, volume ?? this.defaultVolume);
		}

		const sound = this.sounds.get(name);
		if (fileName) sound.fileName = fileName;
		if (volume !== null) sound.volume = volume;
		if (sound.loaded && sound.url) return sound.url;

		try {
			sound.url = await this.runtime.assets.getMediaFileUrl(sound.fileName);
			sound.loaded = true;
			return sound.url;
		} catch (error) {
			console.error("SoundManager: failed to load sound", name, error);
			return null;
		}
	},

	async loadAll() {
		await Promise.all(Object.entries(this.soundFiles).map(([name, fileName]) =>
			this.load(name, fileName)
		));
	},

	async play(name, options = {}) {
		if (!this.sounds.has(name)) {
			await this.load(name, this.soundFiles[name] || (name + ".webm"));
		}

		const sound = this.sounds.get(name);
		if (!sound) return null;

		if (!sound.loaded || !sound.url) {
			await this.load(name);
			if (!sound.loaded || !sound.url) return null;
		}

		const loop = !!options.loop;
		const volume = (options.volume ?? sound.volume ?? this.defaultVolume) * this.masterVolume;

		if (loop && this.loops.has(name)) {
			const existing = this.loops.get(name);
			if (!existing.paused) return existing;
		}

		const audio = new Audio(sound.url);
		audio.loop = loop;
		audio.preload = "auto";
		audio.volume = volume;
		audio.addEventListener("error", () => {
			console.error("SoundManager: failed to play sound", name);
		});

		if (loop) {
			this.loops.set(name, audio);
		} else {
			this.active.add(audio);
			audio.addEventListener("ended", () => {
				this.active.delete(audio);
			});
		}

		try {
			await audio.play();
		} catch (error) {
			if (loop) this.loops.delete(name);
			else this.active.delete(audio);
			console.error("SoundManager: playback blocked", name, error);
		}

		return audio;
	},

	stop(name) {
		const audio = this.loops.get(name);
		if (!audio) return;
		audio.pause();
		audio.currentTime = 0;
		this.loops.delete(name);
	},

	stopAll() {
		for (const audio of this.loops.values()) {
			audio.pause();
			audio.currentTime = 0;
		}
		this.loops.clear();
		for (const audio of this.active) {
			audio.pause();
			audio.currentTime = 0;
		}
		this.active.clear();
	},

	setVolume(name, volume) {
		if (name === null) {
			this.masterVolume = volume;
			return;
		}
		const sound = this.sounds.get(name);
		if (sound) sound.volume = volume;
	},

	setMasterVolume(volume) {
		this.masterVolume = volume;
	}
};
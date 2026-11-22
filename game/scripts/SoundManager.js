globalThis.SoundManager = {
	runtime: null,
	masterVolume: 1,
	defaultVolume: 0.7,
	files: {
		run: "run.webm",
		jump: "jump.webm",
		frameFill: "frameFills.webm",
		frameFall: "frameFall.webm"
	},
	bank: new Map(),
	loops: new Map(),
	generation: new Map(),
	pools: new Map(),

	initialize(runtime, files) {
		this.runtime = runtime;
		if (files) {
			for (const key in files) this.files[key] = files[key];
		}
		if (this.bank.size === 0) this.loadAll();
	},

	register(name, fileName, volume = this.defaultVolume) {
		this.files[name] = fileName;
		const entry = this.bank.get(name);
		if (!entry) return;
		entry.fileName = fileName;
		entry.volume = volume;
		entry.url = null;
	},

	async load(name, fileName = null, volume = null) {
		return this.resolve(name, fileName, volume);
	},

	loadAll() {
		for (const name of Object.keys(this.files)) this.resolve(name);
	},

	async resolve(name, fileName = null, volume = null) {
		if (!this.runtime?.assets) return null;

		let entry = this.bank.get(name);
		if (!entry) {
			entry = {
				fileName: fileName || this.files[name] || `${name}.webm`,
				volume: volume ?? this.defaultVolume,
				url: null,
				pending: null
			};
			this.bank.set(name, entry);
		}
		if (fileName) entry.fileName = fileName;
		if (volume !== null) entry.volume = volume;
		if (entry.url) return entry.url;
		if (entry.pending) return entry.pending;

		let request;
		try {
			request = this.runtime.assets.getMediaFileUrl(entry.fileName);
		} catch (error) {
			console.error("SoundManager: failed to load", name, error);
			return null;
		}

		// This Construct build returns the URL directly. Promise.resolve covers both that and a real Promise.
		entry.pending = Promise.resolve(request)
			.then((url) => {
				entry.url = url || null;
				entry.pending = null;
				return entry.url;
			})
			.catch((error) => {
				entry.pending = null;
				console.error("SoundManager: failed to load", name, error);
				return null;
			});
		return entry.pending;
	},

	async play(name, options = {}) {
		const url = await this.resolve(name, this.files[name] || null, null);
		if (!url) return null;

		const entry = this.bank.get(name);
		const base = options.volume ?? entry?.volume ?? this.defaultVolume;
		const volume = base * this.masterVolume;
		if (options.loop) return this.startLoop(name, url, base);
		return this.startOneShot(name, url, volume);
	},

	async startLoop(name, url, base) {
		let loop = this.loops.get(name);
		if (!loop) {
			const audio = new Audio(url);
			audio.loop = true;
			audio.preload = "auto";
			loop = { audio, starting: false, base };
			this.loops.set(name, loop);
		}

		loop.base = base;
		loop.audio.loop = true;
		loop.audio.volume = base * this.masterVolume;
		if (!loop.audio.paused) return loop.audio;
		if (loop.starting) return loop.audio;

		const generation = this.generation.get(name) || 0;
		loop.starting = true;
		try {
			await loop.audio.play();
			if ((this.generation.get(name) || 0) !== generation) {
				this.halt(loop.audio);
				return null;
			}
			return loop.audio;
		} catch (error) {
			if ((this.generation.get(name) || 0) !== generation || error?.name === "AbortError") {
				return null;
			}
			console.error("SoundManager: playback failed", name, error);
			return null;
		} finally {
			if (this.loops.get(name) === loop) loop.starting = false;
		}
	},

	shot(name, url) {
		let pool = this.pools.get(name);
		if (!pool) {
			pool = [];
			this.pools.set(name, pool);
		}
		for (let i = 0; i < pool.length; i++) {
			const audio = pool[i];
			if (audio.paused || audio.ended) return audio;
		}
		if (pool.length >= 4) return pool[0];
		const audio = new Audio(url);
		audio.preload = "auto";
		pool.push(audio);
		return audio;
	},

	async startOneShot(name, url, volume) {
		const audio = this.shot(name, url);
		audio.volume = volume;
		try {
			audio.currentTime = 0;
		} catch (error) {
			// Seeking can fail before the first jump sound has metadata.
		}

		try {
			await audio.play();
			return audio;
		} catch (error) {
			if (error?.name === "AbortError") return null;
			console.error("SoundManager: playback failed", name, error);
			return null;
		}
	},

	halt(audio) {
		if (!audio) return;
		audio.loop = false;
		try {
			audio.pause();
		} catch (error) {
			// The element can already be stopping.
		}
		try {
			audio.currentTime = 0;
		} catch (error) {
			// Some browsers reject seeking before metadata loads.
		}
	},

	stop(name) {
		this.generation.set(name, (this.generation.get(name) || 0) + 1);
		const loop = this.loops.get(name);
		if (!loop) return;
		loop.starting = false;
		this.halt(loop.audio);
	},

	stopAll() {
		for (const name of this.loops.keys()) this.stop(name);
		for (const pool of this.pools.values()) {
			for (let i = 0; i < pool.length; i++) this.halt(pool[i]);
		}
	},

	setVolume(name, volume) {
		if (name === null) {
			this.masterVolume = volume;
			return;
		}
		const entry = this.bank.get(name);
		if (entry) entry.volume = volume;
		const loop = this.loops.get(name);
		if (loop) loop.audio.volume = volume * this.masterVolume;
	},

	setMasterVolume(volume) {
		this.masterVolume = Math.min(1, Math.max(0, Number(volume) || 0));
		for (const loop of this.loops.values()) {
			if (!loop?.audio || loop.base == null) continue;
			loop.audio.volume = loop.base * this.masterVolume;
		}
	}
};

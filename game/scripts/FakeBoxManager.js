
globalThis.FakeBoxManager = {
	runtime: null,
	keys: new Set(),
	speed: 600,

	reset() {
		this.keys.clear();
		globalThis.SoundManager?.stopAll();
	},

	initialize(runtime) {
		if (this.runtime === runtime) return;

		this.runtime = runtime;
		this.reset();

		runtime.addEventListener("keydown", e => {
			this.keys.add(e.code.toLowerCase());
			this.keys.add(e.key.toLowerCase());
		});

		runtime.addEventListener("keyup", e => {
			this.keys.delete(e.code.toLowerCase());
			this.keys.delete(e.key.toLowerCase());
		});

		runtime.addEventListener("layoutstart", () => {
			this.reset();
		});
	},

	move(box, obstacles, deltaTime) {
		if (!box) return;

		let movementX = 0;
		let movementY = 0;

		if (this.keys.has("keya") || this.keys.has("arrowleft")) {
			movementX -= this.speed * deltaTime;
		}

		if (this.keys.has("keyd") || this.keys.has("arrowright")) {
			movementX += this.speed * deltaTime;
		}

		if (this.keys.has("keys") || this.keys.has("arrowdown")) {
			movementY += this.speed * deltaTime;
		}

		if (this.keys.has("keyw") || this.keys.has("arrowup")) {
			movementY -= this.speed * deltaTime;
		}

		box.x += movementX;
		this.resolveCollisionsX(box, obstacles, movementX);

		box.y += movementY;
		this.resolveCollisionsY(box, obstacles, movementY);
	},

	resolveCollisionsX(box, obstacles, movementX) {
		if (movementX === 0) return;

		let boxRect = box.getBoundingBox();

		for (const obstacle of obstacles) {
			if (obstacle === box) continue;

			const obstacleRect = obstacle.getBoundingBox();

			const overlaps =
				boxRect.right > obstacleRect.left &&
				boxRect.left < obstacleRect.right &&
				boxRect.bottom > obstacleRect.top &&
				boxRect.top < obstacleRect.bottom;

			if (!overlaps) continue;

			if (movementX > 0) {
				box.x -= boxRect.right - obstacleRect.left;
			} else {
				box.x += obstacleRect.right - boxRect.left;
			}

			boxRect = box.getBoundingBox();
		}
	},

	resolveCollisionsY(box, obstacles, movementY) {
		if (movementY === 0) return;

		let boxRect = box.getBoundingBox();

		for (const obstacle of obstacles) {
			if (obstacle === box) continue;

			const obstacleRect = obstacle.getBoundingBox();

			const overlaps =
				boxRect.right > obstacleRect.left &&
				boxRect.left < obstacleRect.right &&
				boxRect.bottom > obstacleRect.top &&
				boxRect.top < obstacleRect.bottom;

			if (!overlaps) continue;

			if (movementY > 0) {
				box.y -= boxRect.bottom - obstacleRect.top;
			} else {
				box.y += obstacleRect.bottom - boxRect.top;
			}

			boxRect = box.getBoundingBox();
		}
	}
};

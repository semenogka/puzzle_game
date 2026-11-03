
globalThis.PlayerManager = {
	keys: new Set(),

	velocityY: 0,
	onGround: false,

	speed: 600,
	jumpForce: 1000,
	gravity: 2000,

	reset() {
		this.keys.clear();
		this.velocityY = 0;
		this.onGround = false;
	},

	initialize(runtime) {
		this.keys.clear();

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

	getMovementX(deltaTime) {
		let movementX = 0;

		if (this.keys.has("keya") || this.keys.has("arrowleft")) {
			movementX -= this.speed * deltaTime;
		}

		if (this.keys.has("keyd") || this.keys.has("arrowright")) {
			movementX += this.speed * deltaTime;
		}

		return movementX;
	},

	handleJump(player, boxes, solidObstacles) {
		const jumpPressed =
			this.keys.has("space") ||
			this.keys.has("keyw") ||
			this.keys.has("arrowup");

		if (!jumpPressed || !this.onGround) return false;

		const playerBox = player.getBoundingBox();

		for (const obstacle of solidObstacles) {
			if (!boxes.includes(obstacle)) continue;

			const obstacleBox = obstacle.getBoundingBox();

			const isStanding =
				playerBox.bottom >= obstacleBox.top - 2 &&
				playerBox.bottom <= obstacleBox.top + 10 &&
				playerBox.right > obstacleBox.left &&
				playerBox.left < obstacleBox.right;

			if (isStanding) {
                globalThis.BoxManager.lockAfterJump(obstacle);
				break;
			}
		}

		this.velocityY = -this.jumpForce;
		this.onGround = false;
	},

	checkHorizontalCollision(player, solidObstacles, movementX) {
		if (movementX === 0) return;

		let playerBox = player.getBoundingBox();

		for (const obstacle of solidObstacles) {
			const obstacleBox = obstacle.getBoundingBox();

			const overlaps =
				playerBox.right > obstacleBox.left &&
				playerBox.left < obstacleBox.right &&
				playerBox.bottom > obstacleBox.top &&
				playerBox.top < obstacleBox.bottom;

			if (!overlaps) continue;

			if (movementX > 0) {
				player.x -= playerBox.right - obstacleBox.left;
			} else {
				player.x += obstacleBox.right - playerBox.left;
			}

			playerBox = player.getBoundingBox();
		}
	},

	checkGroundCollision(player, solidObstacles, boxes, previousBottom) {
		this.onGround = false;

		let playerBox = player.getBoundingBox();

		for (const obstacle of solidObstacles) {
			const obstacleBox = obstacle.getBoundingBox();

			const overlaps =
				playerBox.right > obstacleBox.left &&
				playerBox.left < obstacleBox.right &&
				playerBox.bottom > obstacleBox.top &&
				playerBox.top < obstacleBox.bottom;

			if (!overlaps) continue;

			if (this.velocityY >= 0 && previousBottom <= obstacleBox.top + 10) {
				player.y -= playerBox.bottom - obstacleBox.top;
				this.velocityY = 0;
				this.onGround = true;

				if (boxes.includes(obstacle)) {
					const dragBehavior = obstacle.behaviors["Перетаскивание"];

					if (dragBehavior) {
						dragBehavior.isEnabled = false;
					}
				}
			} else if (this.velocityY < 0) {
				player.y += obstacleBox.bottom - playerBox.top;
				this.velocityY = 0;
			}

			playerBox = player.getBoundingBox();
		}
	},

	update(player, grounds, boxes, deltaTime) {
		const solidObstacles = [...grounds, ...boxes];

		const movementX = this.getMovementX(deltaTime);

		const jumpedFromBox = this.handleJump(
			player,
			boxes,
			solidObstacles
		);

		player.x += movementX;

		this.checkHorizontalCollision(
			player,
			solidObstacles,
			movementX
		);

		this.velocityY += this.gravity * deltaTime;

		const previousBottom = player.getBoundingBox().bottom;

		player.y += this.velocityY * deltaTime;

		this.checkGroundCollision(
			player,
			solidObstacles,
			boxes,
			previousBottom
		);

		return {
			jumpedFromBox,
			onGround: this.onGround
		};
	}
};

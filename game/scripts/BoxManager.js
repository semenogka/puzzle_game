globalThis.BoxManager = {
	startPositions: new Map(),
	motions: new Map(),

	pushDistance: 20,
	pushDuration: 0.18,
	returnDuration: 0.4,
	lockedBoxes: new Map(),
	jumpLockDuration: 1.5,

	reset() {
		this.startPositions.clear();
		this.motions.clear();
		this.lockedBoxes.clear();
	},

	register(boxes) {
		for (const box of boxes) {
			if (!this.startPositions.has(box)) {
				this.startPositions.set(box, {
					x: box.x,
					y: box.y
				});
			}
		}
	},

	drop(box) {
		 this.enableOrDisableDragging(box, false)
	},

	startMotion(box, targetX, targetY, duration) {
		if (this.motions.has(box)) return;

		this.drop(box);

		this.motions.set(box, {
			startX: box.x,
			startY: box.y,
			targetX,
			targetY,
			elapsed: 0,
			duration
		});
	},

	updateMotions(boxes, deltaTime) {
		for (const box of boxes) {
			const motion = this.motions.get(box);

			if (!motion) continue;

			motion.elapsed += deltaTime;

			const progress = Math.min(
				motion.elapsed / motion.duration,
				1
			);

			const smooth = progress * progress * (3 - 2 * progress);

			box.x = motion.startX +
				(motion.targetX - motion.startX) * smooth;

			box.y = motion.startY +
				(motion.targetY - motion.startY) * smooth;

			if (progress >= 1) {
				box.x = motion.targetX;
				box.y = motion.targetY;

				this.motions.delete(box);

				this.enableOrDisableDragging(box, true)
			}
		}
	},

	checkCameraBounds(boxes) {
		for (const box of boxes) {
			if (this.motions.has(box)) continue;

			const startPosition = this.startPositions.get(box);
			if (!startPosition) continue;

			const viewport = box.layer.getViewport();
			const bounds = box.getBoundingBox();

			const outside =
				bounds.right < viewport.left ||
				bounds.left > viewport.right ||
				bounds.bottom < viewport.top ||
				bounds.top > viewport.bottom;

			if (outside) {
				this.startMotion(
					box,
					startPosition.x,
					startPosition.y,
					this.returnDuration
				);
			}
		}
	},

	resolveCollision(box, obstacle, distance) {
		const boxBounds = box.getBoundingBox();
		const obstacleBounds = obstacle.getBoundingBox();

		const overlapX =
			Math.min(boxBounds.right, obstacleBounds.right) -
			Math.max(boxBounds.left, obstacleBounds.left);

		const overlapY =
			Math.min(boxBounds.bottom, obstacleBounds.bottom) -
			Math.max(boxBounds.top, obstacleBounds.top);

		if (overlapX <= 0 || overlapY <= 0) return false;

		let targetX = box.x;
		let targetY = box.y;

		if (overlapX < overlapY) {
			const direction = box.x < obstacle.x ? -1 : 1;
			targetX += direction * (overlapX + distance);
		} else {
			const direction = box.y < obstacle.y ? -1 : 1;
			targetY += direction * (overlapY + distance);
		}

		this.startMotion(box, targetX, targetY, this.pushDuration);

		return true;
	},

	checkGroundCollisions(boxes, grounds) {
		for (const box of boxes) {
			if (this.motions.has(box)) continue;

			for (const ground of grounds) {
				if (this.resolveCollision(box, ground, this.pushDistance)) {
					break;
				}
			}
		}
	},

	checkPlayerCollisions(boxes, player) {
		for (const box of boxes) {
			if (this.motions.has(box)) continue;

			this.resolveCollision(box, player, 2);
		}
	},

	checkDottedLine(boxes, line) {
		if (!line) return;

		for (const box of boxes) {
			if (this.motions.has(box)) continue;

			const bounds = box.getBoundingBox();

			if (bounds.bottom > line.y) {
				box.y -= bounds.bottom - line.y;
			}
		}
	},

	enableOrDisableDragging(box, status) {
		if (this.motions.has(box) || this.lockedBoxes.has(box)) return;

		const behavior = box.behaviors["Перетаскивание"];

		if (behavior) {
			behavior.isEnabled = status;			
		}
	},

	lockAfterJump(box) {
		if (!box) return;

		this.lockedBoxes.set(box, this.jumpLockDuration);

		this.enableOrDisableDragging(box, false);
	},

	updateLockedBoxes(deltaTime) {
		for (const [box, time] of this.lockedBoxes) {
			const newTime = time - deltaTime;

			if (newTime <= 0) {
				this.lockedBoxes.delete(box);

				if (!this.motions.has(box)) {
					this.enableOrDisableDragging(box, true);
				}
			} else {
				this.lockedBoxes.set(box, newTime);
			}
		}
	},

	update(boxes, grounds, player, line, deltaTime) {
		this.register(boxes);
		this.updateLockedBoxes(deltaTime);
		this.updateMotions(boxes, deltaTime);
		this.checkCameraBounds(boxes);
		this.checkDottedLine(boxes, line);
		this.checkGroundCollisions(boxes, grounds);

		if (player) {
			this.checkPlayerCollisions(boxes, player);
		}
	}
};
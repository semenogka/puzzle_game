
globalThis.FrameManager = {
	runtime: null,
	frameData: [],
	lastLogTime: 0,
	frameFalling: false,
	frameVelocityY: 0,
	boxesInFrame: [],

	reset() {
		this.frameData = [];
		this.lastLogTime = 0;
		this.frameFalling = false;
		this.frameVelocityY = 0;
		this.boxesInFrame = [];
	},

	initialize(runtime) {
		if (this.runtime !== runtime) {
			this.runtime = runtime;

			runtime.addEventListener("beforelayoutstart", () => {
				this.reset();
			});

			runtime.addEventListener("layoutstart", () => {
				this.reset();
				this.initializeFrameDots();
			});
		}

		this.reset();
		this.initializeFrameDots();
	},

	initializeFrameDots() {
		this.frameData = [];

		const frame = this.runtime.objects.Frame.getFirstInstance();
		if (!frame) return;

		const step = 20;
		const box = frame.getBoundingBox();
		const dots = [];

		for (let x = box.left + step; x < box.right - step; x += step) {
			for (let y = box.top + step; y < box.bottom - step; y += step) {
				dots.push({ x, y });
			}
		}

		this.frameData.push({
			frameInstance: frame,
			dots,
			totalCount: dots.length
		});
	},

	isBoxInsideFrame(box, frame) {
		const frameBox = frame.getBoundingBox();

		const halfWidth = box.width / 2;
		const halfHeight = box.height / 2;

		const cos = Math.cos(box.angle);
		const sin = Math.sin(box.angle);

		const corners = [
			[-halfWidth, -halfHeight],
			[halfWidth, -halfHeight],
			[-halfWidth, halfHeight],
			[halfWidth, halfHeight]
		];

		for (const [x, y] of corners) {
			const worldX = box.x + x * cos - y * sin;
			const worldY = box.y + x * sin + y * cos;

			if (
				worldX < frameBox.left ||
				worldX > frameBox.right ||
				worldY < frameBox.top ||
				worldY > frameBox.bottom
			) {
				return false;
			}
		}

		return true;
	},

	checkFrameFilling(boxes) {
		const percentTextObject = this.runtime.objects.Percent.getFirstInstance();
		const frame = this.runtime.objects.Frame.getFirstInstance();

		if (this.frameFalling) {
			if (percentTextObject) {
				percentTextObject.text = "100%";
			}
			return;
		}

		if (!frame || this.frameData.length === 0 || boxes.length === 0) return;

		this.frameData.forEach((data, index) => {
			let filledCount = 0;

			for (const dot of data.dots) {
				for (const box of boxes) {
					if (box.containsPoint(dot.x, dot.y)) {
						filledCount++;
						break;
					}
				}
			}

			const allBoxesInside = boxes.every(box =>
				this.isBoxInsideFrame(box, frame)
			);

			let percentage = data.totalCount > 0
				? Math.round((filledCount / data.totalCount) * 100) + 7
				: 0;

			if (!allBoxesInside || percentage < 100) {
				percentage = Math.min(percentage, 99);
			}

			if (percentTextObject) {
				percentTextObject.text = percentage + "%";
			}

			const currentTime = this.runtime.gameTime;

			if (currentTime - this.lastLogTime >= 0.5) {
				if (index === this.frameData.length - 1) {
					this.lastLogTime = currentTime;
				}
			}

			if (percentage >= 100 && allBoxesInside) {
				this.frameFalling = true;
				this.boxesInFrame = [...boxes];

				if (percentTextObject) {
					percentTextObject.text = "100%";
				}

				this.boxesInFrame.forEach(box => {
					const drag = box.behaviors["Перетаскивание"];
					if (drag) drag.isEnabled = false;
				});
			}
		});
	},

	handleFrameFalling(grounds, deltaTime) {
		if (!this.frameFalling) return;

		const frame = this.runtime.objects.Frame.getFirstInstance();
		if (!frame) return;

		this.frameVelocityY += 2000 * deltaTime;
		const movementY = this.frameVelocityY * deltaTime;

		const frameBox = frame.getBoundingBox();
		let hitGround = false;
		let targetY = frame.y + movementY;

		for (const ground of grounds) {
			const groundBox = ground.getBoundingBox();

			const overlapsX =
				frameBox.right > groundBox.left &&
				frameBox.left < groundBox.right;

			if (
				overlapsX &&
				frameBox.bottom <= groundBox.top &&
				frameBox.bottom + movementY >= groundBox.top
			) {
				const distanceToGround = groundBox.top - frameBox.bottom;
				targetY = frame.y + distanceToGround;
				hitGround = true;
				break;
			}
		}

		const actualMoveY = targetY - frame.y;
		frame.y = targetY;

		this.boxesInFrame.forEach(box => {
			box.y += actualMoveY;
		});

		if (hitGround) {
			this.frameVelocityY = 0;
		}
	},

	checkDottedLine(boxes) {
		if (this.frameFalling) return;

		const line = this.runtime.objects.DottedLine.getFirstInstance();
		const lineY = line ? line.y : Infinity;

		for (const box of boxes) {
			if (box.y > lineY) {
				box.y = lineY;
			}
		}
	},

	update(boxes, grounds, deltaTime) {
		this.handleFrameFalling(grounds, deltaTime);
		this.checkDottedLine(boxes);
		this.checkFrameFilling(boxes);
	}
};
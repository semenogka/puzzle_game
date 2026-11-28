globalThis.FrameManager = {
	runtime: null,
	frameData: [],
	lastLogTime: 0,
	frameFalling: false,
	frameLanded: false,
	frameVelocityY: 0,
	boxesInFrame: [],
	lastPercentage: 0,
	frameDotMarginX: 22,
	frameDotMarginY: 20,
	percentTextBaseSize: 24,
	percentTextMaxSize: 60,
	cameraShakeDuration: 0.25,
	cameraShakeScaleAmplitude: 0.04,
	cameraShakeOffsetMagnitude: 12,
	cameraShakeTimeLeft: 0,
	cameraShakeBaseScale: 1,
	cameraShakeBaseX: 0,
	cameraShakeBaseY: 0,

	reset() {
		if (this.cameraShakeTimeLeft > 0 && this.runtime?.layout) {
			this.runtime.layout.scrollX = this.cameraShakeBaseX;
			this.runtime.layout.scrollY = this.cameraShakeBaseY;
			this.runtime.layout.scale = this.cameraShakeBaseScale;
		}

		this.frameData = [];
		this.lastLogTime = 0;
		this.frameFalling = false;
		this.frameLanded = false;
		this.frameVelocityY = 0;
		this.boxesInFrame = [];
		this.lastPercentage = 0;
		this.cameraShakeTimeLeft = 0;
		this.cameraShakeBaseScale = 1;
		this.cameraShakeBaseX = 0;
		this.cameraShakeBaseY = 0;
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

		const step = 5;
		const marginX = this.frameDotMarginX;
		const marginY = this.frameDotMarginY;
		const box = frame.getBoundingBox();
		const dots = [];

		for (let x = box.left + marginX; x < box.right - marginX; x += step) {
			for (let y = box.top + marginY; y < box.bottom - marginY; y += step) {
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

	updatePercentText(percentTextObject, percentage) {
		if (!percentTextObject) return;

		const clamped = Math.max(0, Math.min(100, percentage));
		const size = this.percentTextBaseSize +
			(this.percentTextMaxSize - this.percentTextBaseSize) * (clamped / 100) * 2;

		percentTextObject.text = Math.round(clamped) + "%";
		percentTextObject.sizePt = size;
	},

	startCameraShake() {
		const layout = this.runtime?.layout;
		if (!layout) return;

		this.cameraShakeTimeLeft = this.cameraShakeDuration;
		this.cameraShakeBaseScale = layout.scale;
		this.cameraShakeBaseX = layout.scrollX;
		this.cameraShakeBaseY = layout.scrollY;
	},

	updateCameraShake(deltaTime) {
		if (this.cameraShakeTimeLeft <= 0) return;

		const layout = this.runtime?.layout;
		if (!layout) {
			this.cameraShakeTimeLeft = 0;
			return;
		}

		this.cameraShakeTimeLeft = Math.max(0, this.cameraShakeTimeLeft - deltaTime);

		if (this.cameraShakeTimeLeft <= 0) {
			layout.scrollX = this.cameraShakeBaseX;
			layout.scrollY = this.cameraShakeBaseY;
			layout.scale = this.cameraShakeBaseScale;
			return;
		}

		const strength = this.cameraShakeTimeLeft / this.cameraShakeDuration;
		const offsetX = (Math.random() * 2 - 1) * this.cameraShakeOffsetMagnitude * strength;
		const offsetY = (Math.random() * 2 - 1) * this.cameraShakeOffsetMagnitude * strength;

		layout.scale = this.cameraShakeBaseScale * (1 + this.cameraShakeScaleAmplitude * strength);
		layout.scrollX = this.cameraShakeBaseX + offsetX;
		layout.scrollY = this.cameraShakeBaseY + offsetY;
	},

	checkFrameFilling(boxes) {
		const percentTextObject = this.runtime.objects.Percent.getFirstInstance();
		const frame = this.runtime.objects.Frame.getFirstInstance();

		if (this.frameFalling) {
			this.lastPercentage = 100;
			this.updatePercentText(percentTextObject, 100);
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

			const fillRatio = data.totalCount > 0
				? filledCount / data.totalCount
				: 0;

			let percentage = Math.round(fillRatio * 100);
			percentage = Math.max(0, Math.min(100, percentage));

			if (!allBoxesInside && percentage >= 100) {
				percentage = 99;
			}

			if (percentage > this.lastPercentage) {
				globalThis.SoundManager?.play("frameFill");
			}
			this.lastPercentage = percentage;

			this.updatePercentText(percentTextObject, percentage);

			const currentTime = this.runtime.gameTime;

			if (currentTime - this.lastLogTime >= 0.5) {
				if (index === this.frameData.length - 1) {
					this.lastLogTime = currentTime;
				}
			}

			if (percentage >= 98 && allBoxesInside) {
				this.frameFalling = true;
				this.frameLanded = false;
				this.boxesInFrame = [...boxes];
				this.updatePercentText(percentTextObject, 100);
				this.startCameraShake();

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
			if (!this.frameLanded) {
				this.frameLanded = true;
				globalThis.SoundManager?.play("frameFall");
			}
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
		this.updateCameraShake(deltaTime);
	}
};

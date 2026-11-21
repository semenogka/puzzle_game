
globalThis.CrushManager = {
	active: true,
	crusherList: [],

	overlapX(a, b) {
		return Math.min(a.right, b.right) - Math.max(a.left, b.left);
	},

	hasGravityTag(inst) {
		if (!inst) return false;
		if (typeof inst.hasTag === "function") return inst.hasTag("gravity");
		if (typeof inst.getAllTags === "function") return inst.getAllTags().includes("gravity");
		return false;
	},

	collectCrushers(boxes) {
		const list = this.crusherList;
		let count = 0;

		const bodies = globalThis.GravityManager?.bodies;

		if (bodies) {
			for (let i = 0; i < bodies.length; i++) {
				const inst = bodies[i]?.inst;

				if (inst && !inst.destroyed && this.hasGravityTag(inst)) {
					list[count++] = inst;
				}
			}
		}

		if (boxes) {
			for (let i = 0; i < boxes.length; i++) {
				const inst = boxes[i];

				if (!inst || inst.destroyed || !this.hasGravityTag(inst)) continue;

				let seen = false;

				for (let j = 0; j < count; j++) {
					if (list[j] === inst) {
						seen = true;
						break;
					}
				}

				if (!seen) list[count++] = inst;
			}
		}

		list.length = count;
		return list;
	},

	supportIn(playerBox, list, minOverlapX, sign) {
		if (!list) return false;

		for (let i = 0; i < list.length; i++) {
			const solid = list[i];

			if (!solid || solid.destroyed) continue;

			const box = solid.getBoundingBox();

			if (this.overlapX(playerBox, box) < minOverlapX) continue;

			if (sign > 0) {
				const gap = playerBox.bottom - box.top;

				if (gap >= -12 && gap <= 20 && box.bottom > playerBox.bottom - 2) {
					return true;
				}
			} else {
				const gap = box.bottom - playerBox.top;

				if (gap >= -12 && gap <= 20 && box.top < playerBox.top + 2) {
					return true;
				}
			}
		}

		return false;
	},

	hasVerticalSupport(playerBox, grounds, crushers, minOverlapX, sign) {
		return (
			this.supportIn(playerBox, grounds, minOverlapX, sign) ||
			this.supportIn(playerBox, crushers, minOverlapX, sign)
		);
	},

	pressesAlongGravity(playerBox, box, width, height, sign) {
		const overlapY = Math.min(playerBox.bottom, box.bottom) -
			Math.max(playerBox.top, box.top);

		if (overlapY <= 0) return false;

		const overlapX = this.overlapX(playerBox, box);

		if (overlapX < Math.max(16, width * 0.5)) return false;

		if (sign > 0) {
			if (box.top > playerBox.top + height * 0.5) return false;
			if (box.bottom < playerBox.top) return false;
			return true;
		}

		if (box.bottom < playerBox.bottom - height * 0.5) return false;
		if (box.top > playerBox.bottom) return false;

		return true;
	},

	isCrushed(player, grounds, boxes, gravitySign) {
		if (!this.active || !player) return false;

		const playerBox = player.getBoundingBox();

		const height = playerBox.bottom - playerBox.top;
		const width = playerBox.right - playerBox.left;

		if (height < 4 || width < 4) return false;

		const minOverlapX = Math.max(16, width * 0.5);
		const crushers = this.collectCrushers(boxes);

		if (!crushers.length) return false;

		if (!this.hasVerticalSupport(
			playerBox,
			grounds,
			crushers,
			minOverlapX,
			gravitySign
		)) return false;

		for (let i = 0; i < crushers.length; i++) {
			const inst = crushers[i];

			if (!inst || inst.destroyed || inst === player) continue;

			if (globalThis.PlayerManager?.canBeDragged?.(inst)) continue;

			const box = inst.getBoundingBox();

			if (this.pressesAlongGravity(
				playerBox,
				box,
				width,
				height,
				gravitySign
			)) {
				return true;
			}
		}

		return false;
	}
};

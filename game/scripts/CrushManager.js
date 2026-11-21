
globalThis.CrushManager = {
	active: true,
	rects: [],
	list: [],

	read(inst, out) {
		const box = inst.getBoundingBox();
		out.left = box.left;
		out.right = box.right;
		out.top = box.top;
		out.bottom = box.bottom;

		if (out.right < out.left) {
			const swap = out.left;
			out.left = out.right;
			out.right = swap;
		}

		if (out.bottom < out.top) {
			const swap = out.top;
			out.top = out.bottom;
			out.bottom = swap;
		}

		return out;
	},

	overlapX(a, b) {
		return Math.min(a.right, b.right) - Math.max(a.left, b.left);
	},

	tallWall(solid, player) {
		const height = solid.bottom - solid.top;
		const solidWidth = solid.right - solid.left;
		const playerWidth = player.right - player.left;
		const spans = solid.top < player.top && solid.bottom > player.bottom;
		return height > 500 && spans && solidWidth > playerWidth * 2;
	},

	draggable(inst) {
		return !!globalThis.PlayerManager?.canBeDragged(inst);
	},

	isCrushed(player, grounds, boxes) {
		if (!this.active) return false;
		if (!player) return false;

		const manager = globalThis.PlayerManager;
		const playerBox = manager?.actorBox
			? manager.actorBox(player)
			: this.read(player, this.playerRect || (this.playerRect = {}));

		const width = playerBox.right - playerBox.left;
		const height = playerBox.bottom - playerBox.top;
		if (width < 2 || height < 2) return false;

		const list = this.list;
		let count = 0;

		const add = (arr) => {
			if (!arr) return;

			for (let i = 0; i < arr.length; i++) {
				const inst = arr[i];
				if (!inst || inst === player) continue;

				let duplicate = false;
				for (let j = 0; j < count; j++) {
					if (list[j] === inst) {
						duplicate = true;
						break;
					}
				}

				if (!duplicate) list[count++] = inst;
			}
		};

		add(grounds);
		add(boxes);
		list.length = count;

		const rects = this.rects;

		for (let i = 0; i < count; i++) {
			let rect = rects[i];

			if (!rect) {
				rects[i] = rect = {
					left: 0,
					right: 0,
					top: 0,
					bottom: 0
				};
			}

			this.read(list[i], rect);
		}

		const minOverlapX = Math.max(16, width * 0.42);
		const mid = (playerBox.top + playerBox.bottom) * 0.5;
		const depth = 6;

		for (let i = 0; i < count; i++) {
			if (!this.active) return false;
			if (this.draggable(list[i])) continue;

			const crusher = rects[i];

			if (this.overlapX(playerBox, crusher) < minOverlapX) continue;
			if (this.tallWall(crusher, playerBox)) continue;

			const fromAbove =
				crusher.bottom > playerBox.top + depth &&
				crusher.top < mid;

			const fromBelow =
				crusher.top < playerBox.bottom - depth &&
				crusher.bottom > mid;

			if (!fromAbove && !fromBelow) continue;

			for (let j = 0; j < count; j++) {
				if (j === i) continue;

				const support = rects[j];

				if (this.overlapX(playerBox, support) < 8) continue;
				if (this.tallWall(support, playerBox)) continue;

				const floorUnderFeet =
					fromAbove &&
					support.top <= playerBox.bottom + 10 &&
					support.top >= mid - 4 &&
					support.bottom > playerBox.bottom - 4;

				const ceilingOverHead =
					fromBelow &&
					support.bottom >= playerBox.top - 10 &&
					support.bottom <= mid + 4 &&
					support.top < playerBox.top + 4;

				if (floorUnderFeet || ceilingOverHead) return true;
			}
		}

		return false;
	}
};

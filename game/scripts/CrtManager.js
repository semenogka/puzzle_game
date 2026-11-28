globalThis.CrtManager = {
	bound: false,
	glass: null,
	game: null,

	bind(runtime) {
		if (this.bound) return;
		this.bound = true;
		if (!document.getElementById("norm-crt-style")) {
			const style = document.createElement("style");
			style.id = "norm-crt-style";
			style.textContent = "@keyframes norm-crt-scan{from{background-position:0 0}to{background-position:0 4px}}@keyframes norm-crt-flicker{0%,100%{opacity:1}47%{opacity:.96}50%{opacity:.9}53%{opacity:.98}}#norm-crt-glass{pointer-events:none !important;position:fixed;z-index:30;margin:0;padding:0;border:0;overflow:hidden;background:repeating-linear-gradient(to bottom,rgba(0,0,0,.34) 0px,rgba(0,0,0,.34) 1px,transparent 1px,transparent 3px);animation:norm-crt-scan .35s linear infinite,norm-crt-flicker 4s steps(2,end) infinite}@media (prefers-reduced-motion:reduce){#norm-crt-glass{animation:none!important}}";
			document.head.appendChild(style);
		}
		const old = document.getElementById("norm-crt-glass");
		if (old) old.remove();
		const glass = document.createElement("div");
		glass.id = "norm-crt-glass";
		glass.style.pointerEvents = "none";
		document.body.appendChild(glass);
		this.glass = glass;
		runtime.addEventListener("layoutstart", () => this.place());
		window.addEventListener("resize", () => this.place());
		const loop = () => {
			this.place();
			requestAnimationFrame(loop);
		};
		requestAnimationFrame(loop);
		this.place();
	},

	canvas() {
		const list = document.querySelectorAll("canvas");
		let best = null;
		let area = 0;
		for (const canvas of list) {
			const box = canvas.getBoundingClientRect();
			const size = box.width * box.height;
			if (size > area) {
				area = size;
				best = canvas;
			}
		}
		return best;
	},

	place() {
		const canvas = this.canvas();
		this.game = canvas;
		const glass = this.glass;
		if (!glass) return;
		if (!canvas) {
			glass.style.display = "none";
			return;
		}
		const rect = canvas.getBoundingClientRect();
		if (rect.width <= 0 || rect.height <= 0) {
			glass.style.display = "none";
			return;
		}
		glass.style.display = "block";
		glass.style.position = "fixed";
		glass.style.pointerEvents = "none";
		glass.style.left = rect.left + "px";
		glass.style.top = rect.top + "px";
		glass.style.width = rect.width + "px";
		glass.style.height = rect.height + "px";
	}
};

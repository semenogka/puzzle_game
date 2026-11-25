const sourceGetContext = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = function (type, attrs) {
	if (type === "webgl" || type === "webgl2" || type === "experimental-webgl") {
		const next = Object.assign({}, attrs, { preserveDrawingBuffer: true });
		return sourceGetContext.call(this, type, next);
	}
	return sourceGetContext.call(this, type, attrs);
};

globalThis.CrtManager = {
	bound: false,
	looping: false,
	gl: null,
	tex: null,
	out: null,
	strength: 1.55,
	seen: 0,
	dark: 0,

	bind(runtime) {
		if (this.bound) return;
		this.bound = true;
		runtime.addEventListener("tick", () => {
			if (this.looping) return;
			this.looping = true;
			requestAnimationFrame(() => this.frame());
		});
	},

	source() {
		const list = document.querySelectorAll("canvas");
		let best = null;
		let area = 0;
		for (const canvas of list) {
			if (canvas === this.out) continue;
			const box = canvas.getBoundingClientRect();
			const size = box.width * box.height;
			if (size > area) {
				area = size;
				best = canvas;
			}
		}
		return best;
	},

	shader(gl, type, text) {
		const shader = gl.createShader(type);
		gl.shaderSource(shader, text);
		gl.compileShader(shader);
		return shader;
	},

	boot(gl) {
		const vert = this.shader(gl, gl.VERTEX_SHADER, [
			"attribute vec2 aPos;",
			"varying vec2 vUv;",
			"void main() {",
			"vUv = aPos * 0.5 + 0.5;",
			"gl_Position = vec4(aPos, 0.0, 1.0);",
			"}"
		].join("\n"));
		const frag = this.shader(gl, gl.FRAGMENT_SHADER, [
			"precision mediump float;",
			"varying vec2 vUv;",
			"uniform sampler2D uTex;",
			"uniform float uStrength;",
			"void main() {",
			"vec2 cc = vUv - 0.5;",
			"float dist = dot(cc, cc);",
			"float bend = 1.0 + uStrength * dist;",
			"float edge = 1.0 + uStrength * 0.5;",
			"vec2 uv = cc * (bend / edge) + 0.5;",
			"vec4 color = texture2D(uTex, uv);",
			"float line = abs(sin(vUv.y * 820.0));",
			"float scan = 0.9 + 0.1 * line;",
			"gl_FragColor = vec4(color.rgb * scan, 1.0);",
			"}"
		].join("\n"));
		const program = gl.createProgram();
		gl.attachShader(program, vert);
		gl.attachShader(program, frag);
		gl.linkProgram(program);
		gl.useProgram(program);
		const buffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
			-1, -1, 1, -1, -1, 1,
			-1, 1, 1, -1, 1, 1
		]), gl.STATIC_DRAW);
		const loc = gl.getAttribLocation(program, "aPos");
		gl.enableVertexAttribArray(loc);
		gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
		this.strengthLoc = gl.getUniformLocation(program, "uStrength");
		const tex = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, tex);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		this.tex = tex;
		this.gl = gl;
	},

	ensure() {
		const source = this.source();
		if (!source) return null;
		source.style.filter = "none";
		source.style.borderRadius = "0px";
		source.style.boxShadow = "none";
		if (!this.out) {
			const out = document.createElement("canvas");
			out.style.position = "fixed";
			out.style.pointerEvents = "none";
			out.style.zIndex = "20";
			out.style.borderRadius = "0";
			out.style.boxShadow = "none";
			out.style.background = "transparent";
			document.body.appendChild(out);
			const gl = out.getContext("webgl", { alpha: false, premultipliedAlpha: false });
			if (!gl) return null;
			this.out = out;
			this.boot(gl);
		}
		const box = source.getBoundingClientRect();
		const out = this.out;
		out.style.left = box.left + "px";
		out.style.top = box.top + "px";
		out.style.width = box.width + "px";
		out.style.height = box.height + "px";
		const w = source.width || Math.round(box.width);
		const h = source.height || Math.round(box.height);
		if (out.width !== w || out.height !== h) {
			out.width = w;
			out.height = h;
			this.gl.viewport(0, 0, w, h);
		}
		return source;
	},

	frame() {
		if (!this.dead) {
			try {
				this.draw();
			} catch (e) {
				this.dead = true;
				if (this.out) this.out.style.display = "none";
			}
		}
		requestAnimationFrame(() => this.frame());
	},

	draw() {
		const source = this.ensure();
		if (!source || !this.gl) return;
		const gl = this.gl;
		gl.bindTexture(gl.TEXTURE_2D, this.tex);
		gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
		gl.uniform1f(this.strengthLoc, this.strength);
		gl.drawArrays(gl.TRIANGLES, 0, 6);
		this.seen++;
		if (this.seen === 45 || this.seen === 120) {
			const pixel = new Uint8Array(4);
			gl.readPixels((this.out.width / 2) | 0, (this.out.height / 2) | 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
			if (pixel[0] + pixel[1] + pixel[2] < 10) this.dark++;
			if (this.dark >= 2) {
				this.dead = true;
				this.out.style.display = "none";
			}
		}
	}
};

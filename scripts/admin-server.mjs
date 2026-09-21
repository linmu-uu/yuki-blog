/**
 * 动态发布后台（本地小工具）
 *
 * 用法：npm run admin
 * 然后浏览器打开 http://127.0.0.1:4322
 *
 * 能做什么：
 * - 写一条动态（正文 / 心情 / 标签 / 配图）
 * - 配图自动压缩成 AVIF 存进 public/gallery/moments/
 * - 一键推到 GitHub（推完 Cloudflare 会自动重新部署）
 *
 * 只监听本机 127.0.0.1，不对外网开放。
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import sharp from "sharp";

const PORT = 4322;
const ROOT = process.cwd();
const MOMENTS_JSON = path.join(ROOT, "src/data/moments.json");
const UPLOAD_DIR = path.join(ROOT, "public/gallery/moments");

/* ---------------- 工具函数 ---------------- */

const readMoments = async () => JSON.parse(await readFile(MOMENTS_JSON, "utf8"));

const writeMoments = async (list) =>
	writeFile(MOMENTS_JSON, `${JSON.stringify(list, null, "\t")}\n`, "utf8");

function now() {
	const d = new Date();
	const pad = (n) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function run(cmd, args) {
	return new Promise((resolve) => {
		const child = spawn(cmd, args, { cwd: ROOT, shell: true });
		let out = "";
		child.stdout.on("data", (chunk) => {
			out += chunk.toString();
		});
		child.stderr.on("data", (chunk) => {
			out += chunk.toString();
		});
		child.on("close", (code) => resolve({ code, out }));
	});
}

const json = (res, data, status = 200) => {
	res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
	res.end(JSON.stringify(data));
};

const readBody = (req) =>
	new Promise((resolve) => {
		let raw = "";
		req.on("data", (chunk) => {
			raw += chunk;
		});
		req.on("end", () => {
			try {
				resolve(raw ? JSON.parse(raw) : {});
			} catch {
				resolve({});
			}
		});
	});

/* ---------------- 接口 ---------------- */

async function handleApi(req, res, url) {
	if (url.pathname === "/api/moments" && req.method === "GET") {
		return json(res, await readMoments());
	}

	// 上传配图：前端把图片转成 dataURL 发过来，这里压成 AVIF
	if (url.pathname === "/api/upload" && req.method === "POST") {
		const body = await readBody(req);
		if (!body.dataUrl) return json(res, { error: "没有收到图片" }, 400);

		await mkdir(UPLOAD_DIR, { recursive: true });
		const base64 = body.dataUrl.split(",")[1] ?? "";
		const buffer = Buffer.from(base64, "base64");
		const name = `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}.avif`;
		const file = path.join(UPLOAD_DIR, name);

		const before = buffer.length;
		await sharp(buffer)
			.rotate()
			.resize({ width: 1400, height: 1400, fit: "inside", withoutEnlargement: true })
			.avif({ quality: 68, effort: 4 })
			.toFile(file);
		const after = (await import("node:fs")).statSync(file).size;

		return json(res, {
			path: `/gallery/moments/${name}`,
			size: `${(before / 1024).toFixed(0)} KB → ${(after / 1024).toFixed(0)} KB`,
		});
	}

	// 新增一条动态
	if (url.pathname === "/api/moment" && req.method === "POST") {
		const body = await readBody(req);
		const content = String(body.content ?? "").trim();
		if (!content) return json(res, { error: "正文不能为空" }, 400);

		const list = await readMoments();
		list.unshift({
			date: body.date?.trim() || now(),
			content,
			...(Array.isArray(body.images) && body.images.length ? { images: body.images } : {}),
			...(Array.isArray(body.tags) && body.tags.length ? { tags: body.tags } : {}),
			...(body.mood?.trim() ? { mood: body.mood.trim() } : {}),
		});
		await writeMoments(list);

		return json(res, { ok: true, count: list.length });
	}

	// 删除某条
	if (url.pathname === "/api/delete" && req.method === "POST") {
		const body = await readBody(req);
		const list = await readMoments();
		const next = list.filter((item) => `${item.date}|${item.content}` !== body.key);
		await writeMoments(next);
		return json(res, { ok: true, count: next.length });
	}

	// 推送到 GitHub（Cloudflare 会自动构建）
	if (url.pathname === "/api/publish" && req.method === "POST") {
		const body = await readBody(req);
		const message = body.message?.trim() || "chore: 更新动态";
		const add = await run("git", ["add", "-A"]);
		if (add.code !== 0) return json(res, { ok: false, log: add.out }, 500);

		const commit = await run("git", ["commit", "-m", message]);
		const push = await run("git", ["push"]);

		return json(res, {
			ok: push.code === 0,
			log: [add.out, commit.out, push.out].filter(Boolean).join("\n").trim(),
		});
	}

	return json(res, { error: "未知接口" }, 404);
}

/* ---------------- 页面 ---------------- */

const page = /* html */ `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>动态发布后台 · Yuki的小窝</title>
<style>
  :root {
    --bg: #070e20; --surface: rgba(255,255,255,.05); --border: rgba(140,190,255,.18);
    --text: #eef5ff; --muted: #90a8ca; --accent: #3b9bff; --accent2: #5fe1ff; --halo: #ffe08a;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; color: var(--text);
    font-family: "MiSans","HarmonyOS Sans SC","PingFang SC","Microsoft YaHei",system-ui,sans-serif;
    background:
      radial-gradient(50rem 34rem at 10% -6%, rgba(18,138,250,.3), transparent 62%),
      radial-gradient(44rem 30rem at 92% 4%, rgba(95,225,255,.18), transparent 60%),
      linear-gradient(180deg, #070e20, #04070f);
    padding: 32px 20px 60px;
  }
  .wrap { max-width: 880px; margin: 0 auto; }
  header { display: flex; align-items: center; gap: 14px; margin-bottom: 26px; }
  .mark {
    width: 44px; height: 44px; border-radius: 14px; display: grid; place-items: center;
    background: linear-gradient(140deg, rgba(18,138,250,.35), rgba(95,225,255,.18));
    border: 1px solid var(--border); font-size: 22px;
  }
  h1 { font-size: 20px; margin: 0; }
  header p { margin: 2px 0 0; font-size: 12px; color: var(--muted); letter-spacing: .12em; }
  .card {
    background: var(--surface); border: 1px solid var(--border); border-radius: 18px;
    padding: 20px; backdrop-filter: blur(14px); margin-bottom: 18px;
  }
  label { display: block; font-size: 12px; color: var(--muted); margin: 0 0 6px; letter-spacing: .08em; }
  textarea, input {
    width: 100%; padding: 12px 14px; border-radius: 12px; color: var(--text);
    background: rgba(255,255,255,.05); border: 1px solid var(--border);
    font-family: inherit; font-size: 14px; line-height: 1.7; outline: none;
  }
  textarea:focus, input:focus { border-color: rgba(95,225,255,.6); }
  textarea { min-height: 130px; resize: vertical; }
  .row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .row3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px; }
  .field + .field { margin-top: 14px; }
  .drop {
    margin-top: 10px; padding: 18px; text-align: center; font-size: 13px; color: var(--muted);
    border: 1px dashed rgba(140,190,255,.35); border-radius: 14px; cursor: pointer;
    background: rgba(255,255,255,.02);
  }
  .drop.on { border-color: var(--accent2); color: var(--text); }
  .thumbs { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 12px; }
  .thumb { position: relative; width: 96px; height: 72px; border-radius: 10px; overflow: hidden; border: 1px solid var(--border); }
  .thumb img { width: 100%; height: 100%; object-fit: cover; }
  .thumb button {
    position: absolute; top: 3px; right: 3px; width: 20px; height: 20px; border-radius: 50%;
    border: none; background: rgba(4,7,15,.8); color: #fff; cursor: pointer; line-height: 1;
  }
  .actions { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
  button.main {
    padding: 11px 24px; border-radius: 999px; border: none; cursor: pointer;
    font-size: 14px; font-weight: 700; color: #06101f;
    background: linear-gradient(120deg, #128afa, #5fe1ff);
    box-shadow: 0 14px 30px -14px rgba(18,138,250,.9);
  }
  button.ghost {
    padding: 11px 20px; border-radius: 999px; cursor: pointer; font-size: 13px;
    color: var(--text); background: rgba(255,255,255,.06); border: 1px solid var(--border);
  }
  button:disabled { opacity: .5; cursor: default; }
  .hint { font-size: 12px; color: var(--muted); }
  .log {
    margin-top: 14px; padding: 12px 14px; border-radius: 12px; font: 12px/1.6 Consolas, monospace;
    background: rgba(4,7,15,.7); border: 1px solid var(--border); white-space: pre-wrap;
    max-height: 220px; overflow: auto; color: #9fe6c0;
  }
  .list { margin: 0; padding: 0; list-style: none; }
  .list li { padding: 12px 0; border-bottom: 1px dashed rgba(140,190,255,.18); font-size: 13px; }
  .list li:last-child { border-bottom: none; }
  .list time { display: block; font-size: 11px; color: var(--muted); margin-bottom: 4px; }
  .list .del { float: right; font-size: 11px; color: #ff9db1; cursor: pointer; background: none; border: none; }
  h2 { font-size: 14px; margin: 0 0 12px; letter-spacing: .06em; color: var(--muted); }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <span class="mark">✦</span>
    <div>
      <h1>动态发布后台</h1>
      <p>Yuki的小窝 · 写完点发布就会自动上线</p>
    </div>
  </header>

  <section class="card">
    <div class="field">
      <label>正文（支持换行）</label>
      <textarea id="content" placeholder="今天发生了什么喵～"></textarea>
    </div>

    <div class="row field">
      <div>
        <label>心情（可选）</label>
        <input id="mood" placeholder="开心 / 平静 / 期待…" />
      </div>
      <div>
        <label>标签（可选，用逗号分隔）</label>
        <input id="tags" placeholder="建站, 日常" />
      </div>
    </div>

    <div class="field">
      <label>配图（可选，最多 4 张，会自动压缩）</label>
      <div class="drop" id="drop">点这里选图，或把图片拖进来</div>
      <input id="file" type="file" accept="image/*" multiple hidden />
      <div class="thumbs" id="thumbs"></div>
    </div>

    <div class="actions" style="margin-top:18px">
      <button class="main" id="publish">发布并上线</button>
      <button class="ghost" id="save">只保存到本地</button>
      <span class="hint" id="status"></span>
    </div>
    <div class="log" id="log" hidden></div>
  </section>

  <section class="card">
    <h2>已有动态</h2>
    <ul class="list" id="list"></ul>
  </section>
</div>

<script>
  const $ = (id) => document.getElementById(id);
  let images = [];

  const log = (text) => {
    const box = $("log");
    box.hidden = false;
    box.textContent = text;
  };

  async function refresh() {
    const list = await (await fetch("/api/moments")).json();
    $("list").innerHTML = list.map((m) =>
      '<li><button class="del" data-key="' + encodeURIComponent(m.date + "|" + m.content) + '">删除</button>' +
      '<time>' + m.date + (m.mood ? " · " + m.mood : "") + '</time>' +
      m.content.replace(/</g, "&lt;").replace(/\\n/g, "<br>") + '</li>'
    ).join("");
    for (const btn of document.querySelectorAll(".del")) {
      btn.onclick = async () => {
        if (!confirm("确定删除这条动态？")) return;
        await fetch("/api/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: decodeURIComponent(btn.dataset.key) }),
        });
        refresh();
      };
    }
  }

  async function upload(file) {
    const dataUrl = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });
    $("status").textContent = "正在压缩图片…";
    const res = await fetch("/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataUrl }),
    });
    const data = await res.json();
    if (data.path) {
      images.push(data.path);
      $("status").textContent = data.size ? "压缩好了：" + data.size : "";
      renderThumbs();
    } else {
      $("status").textContent = data.error || "上传失败";
    }
  }

  function renderThumbs() {
    $("thumbs").innerHTML = images
      .map((src, i) => '<div class="thumb"><img src="' + src + '"><button data-i="' + i + '">×</button></div>')
      .join("");
    for (const btn of document.querySelectorAll(".thumb button")) {
      btn.onclick = () => {
        images.splice(Number(btn.dataset.i), 1);
        renderThumbs();
      };
    }
  }

  $("drop").onclick = () => $("file").click();
  $("file").onchange = (e) => {
    for (const file of e.target.files) upload(file);
    e.target.value = "";
  };
  for (const type of ["dragover", "drop"]) {
    $("drop").addEventListener(type, (e) => {
      e.preventDefault();
      $("drop").classList.toggle("on", type === "dragover");
      if (type === "drop") for (const file of e.dataTransfer.files) upload(file);
    });
  }

  async function submit(publish) {
    const content = $("content").value.trim();
    if (!content) {
      $("status").textContent = "正文还没写呢喵～";
      return;
    }
    $("publish").disabled = true;
    $("save").disabled = true;
    $("status").textContent = "正在保存…";

    const res = await fetch("/api/moment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content,
        mood: $("mood").value,
        tags: $("tags").value.split(/[,，]/).map((t) => t.trim()).filter(Boolean),
        images,
      }),
    });
    const data = await res.json();
    if (!data.ok) {
      $("status").textContent = data.error || "保存失败";
      $("publish").disabled = false;
      $("save").disabled = false;
      return;
    }

    $("content").value = "";
    $("mood").value = "";
    $("tags").value = "";
    images = [];
    renderThumbs();
    refresh();

    if (!publish) {
      $("status").textContent = "已保存到本地（还没上线）";
      $("publish").disabled = false;
      $("save").disabled = false;
      return;
    }

    $("status").textContent = "正在推送到 GitHub…";
    const published = await (
      await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "chore: 更新动态" }),
      })
    ).json();

    log(published.log || "(没有输出)");
    $("status").textContent = published.ok
      ? "已推送 ✓ 等一两分钟 Cloudflare 部署完就上线了"
      : "推送失败，看看下面的日志（可能是没开梯子）";
    $("publish").disabled = false;
    $("save").disabled = false;
  }

  $("publish").onclick = () => submit(true);
  $("save").onclick = () => submit(false);
  refresh();
</script>
</body>
</html>`;

/* ---------------- 启动 ---------------- */

const server = http.createServer(async (req, res) => {
	const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);

	if (url.pathname.startsWith("/api/")) {
		try {
			await handleApi(req, res, url);
		} catch (error) {
			json(res, { error: String(error) }, 500);
		}
		return;
	}

	// 预览上传的图片
	if (url.pathname.startsWith("/gallery/")) {
		const file = path.join(ROOT, "public", url.pathname);
		if (existsSync(file)) {
			res.writeHead(200, { "Content-Type": "image/avif" });
			res.end(await readFile(file));
			return;
		}
	}

	res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
	res.end(page);
});

server.listen(PORT, "127.0.0.1", () => {
	console.log(`\n  动态发布后台已启动喵～`);
	console.log(`  在浏览器打开：http://127.0.0.1:${PORT}\n`);
	console.log(`  （只在本机可访问，关掉这个窗口后台就停了）\n`);
});

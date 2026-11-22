/* Tech Landscape — interactive map of software & AI infrastructure.
   Data lives in data/landscape.json. Edits made on the page are kept as a
   local draft and committed back to the repo with the GitHub API. */
(() => {
  "use strict";

  const DATA_PATH = "data/landscape.json";
  const LS_DRAFT = "tl-draft-v1";
  const LS_SETTINGS = "tl-github-v1";
  const LS_EXPANDED = "tl-expanded-v1";
  const ROW_H = 40;
  const COL_X = [0, 250, 560, 900, 1200]; // x position per depth

  let doc = null;            // { meta, tree }
  let byId = new Map();      // id -> node
  let parentOf = new Map();  // id -> parent node
  let expanded = new Set();
  let selectedId = null;
  let editMode = false;
  let dirty = false;
  let changes = [];
  let matchIds = new Set();

  const $ = (s) => document.querySelector(s);
  const svg = d3.select("#canvas");
  const gRoot = svg.append("g");
  const gLinks = gRoot.append("g");
  const gNodes = gRoot.append("g");
  const zoom = d3.zoom().scaleExtent([0.2, 2.5]).on("zoom", (e) => gRoot.attr("transform", e.transform));
  svg.call(zoom).on("dblclick.zoom", null);

  // ───────── helpers ─────────
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "node";
  const host = (d) => String(d || "").replace(/^https?:\/\//, "").split("/")[0];
  const href = (d) => (d ? (/^https?:/.test(d) ? d : "https://" + d) : "");
  const logoUrl = (n, size = 64) => n.logo || (n.domain ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host(n.domain))}&sz=${size}` : "");
  const initials = (name) => String(name).split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  function newId(name) {
    let base = slug(name), id = base, i = 2;
    while (byId.has(id)) id = `${base}-${i++}`;
    return id;
  }
  function index() {
    byId.clear(); parentOf.clear();
    (function walk(n, p) {
      if (!n.id || (byId.has(n.id) && byId.get(n.id) !== n)) n.id = newId(n.name);
      byId.set(n.id, n);
      if (p) parentOf.set(n.id, p);
      (n.children || []).forEach((c) => walk(c, n));
    })(doc.tree, null);
  }
  function pathTo(id) {
    const out = []; let n = byId.get(id);
    while (n) { out.unshift(n); n = parentOf.get(n.id); }
    return out;
  }
  function colorOf(id) {
    for (const n of pathTo(id).reverse()) if (n.color) return n.color;
    return "#1c1b19";
  }
  function countCompanies(n) {
    if (n.type === "company") return 1;
    return (n.children || []).reduce((a, c) => a + countCompanies(c), 0);
  }
  function statusKind(s = "") {
    const t = s.toLowerCase();
    if (t.startsWith("public") || t.includes("ipo")) return t.includes("ipo in progress") ? "pending" : "public";
    if (t.startsWith("pending") || t.startsWith("being")) return "pending";
    if (t.startsWith("acquired") || t.includes("taken private") || t.startsWith("owned by")) return "acquired";
    if (t.startsWith("open source")) return "oss";
    if (t.startsWith("part of")) return "part";
    return "private";
  }
  const STATUS_COLOR = { public: "#16a34a", private: "#6366f1", acquired: "#dc2626", pending: "#d97706", oss: "#9333ea", part: "#64748b" };

  let toastTimer;
  function toast(msg, isError = false, ms = 3200) {
    const t = $("#toast"); t.textContent = msg; t.className = "toast" + (isError ? " error" : ""); t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), ms);
  }

  // Measure text with a hidden SVG <text> so widths match the real rendered font.
  const measurer = svg.append("text").attr("visibility", "hidden").attr("x", -9999).attr("y", -9999);
  const measureCache = new Map();
  function measure(text, cls) {
    const key = cls + "|" + text;
    if (measureCache.has(key)) return measureCache.get(key);
    measurer.attr("class", cls).text(text);
    const w = measurer.node().getComputedTextLength();
    measureCache.set(key, w);
    return w;
  }

  // ───────── persistence ─────────
  function saveDraft() {
    try { localStorage.setItem(LS_DRAFT, JSON.stringify({ doc, changes, at: Date.now() })); } catch {}
  }
  function clearDraft() { try { localStorage.removeItem(LS_DRAFT); } catch {} }
  function saveExpanded() { try { localStorage.setItem(LS_EXPANDED, JSON.stringify([...expanded])); } catch {} }
  function getSettings() {
    let s = {};
    try { s = JSON.parse(localStorage.getItem(LS_SETTINGS) || "{}"); } catch {}
    if (!s.owner || !s.repo) {
      const m = location.hostname.match(/^([^.]+)\.github\.io$/);
      if (m) { s.owner = s.owner || m[1]; s.repo = s.repo || location.pathname.split("/").filter(Boolean)[0] || `${m[1]}.github.io`; }
    }
    s.branch = s.branch || "main";
    return s;
  }

  function markDirty(what) {
    dirty = true;
    if (what) changes.push(what);
    saveDraft();
    $("#btn-save").hidden = false;
    $("#btn-save").textContent = `Save to GitHub (${changes.length || "•"})`;
  }

  // ───────── rendering ─────────
  function visibleHierarchy() {
    return d3.hierarchy(doc.tree, (d) => (d.type !== "company" && (d.type === "root" || expanded.has(d.id)) ? d.children : null));
  }

  function nodeWidth(d) {
    const n = d.data;
    if (n.type === "company") return 34 + measure(n.name, "m-company");
    if (n.type === "root") return 34 + measure(n.name, "m-root");
    const count = String(countCompanies(n));
    return 26 + measure(n.name, "m-cat") + 12 + measure(count, "m-count") + 26;
  }

  let lastPos = new Map();
  function render(focusId) {
    const root = visibleHierarchy();
    d3.tree().nodeSize([ROW_H, 1]).separation((a, b) => (a.parent === b.parent ? 1 : 1.25))(root);
    root.each((d) => { d.y = COL_X[d.depth] ?? d.depth * 300; });

    const nodes = root.descendants();
    const links = root.links();
    const t = svg.transition().duration(380).ease(d3.easeCubicOut);
    const posOf = (id) => lastPos.get(id);
    const origin = (d) => {
      let p = d.parent; while (p && !posOf(p.data.id)) p = p.parent;
      return p ? posOf(p.data.id) : { x: d.x, y: d.y };
    };

    // links
    const linkPath = d3.linkHorizontal().x((p) => p.y).y((p) => p.x);
    const startOf = (l) => ({ x: l.source.x, y: l.source.y + nodeWidth(l.source) });
    gLinks.selectAll("path.link").data(links, (l) => l.target.data.id).join(
      (enter) => enter.append("path").attr("class", "link").attr("d", (l) => { const o = origin(l.target); const s = { x: o.x, y: o.y }; return linkPath({ source: s, target: s }); }),
      (update) => update,
      (exit) => exit.transition(t).style("opacity", 0).remove()
    ).transition(t)
      .attr("d", (l) => linkPath({ source: startOf(l), target: { x: l.target.x, y: l.target.y } }))
      .style("opacity", 1);

    // nodes
    const sel = gNodes.selectAll("g.node").data(nodes, (d) => d.data.id);
    const enter = sel.enter().append("g")
      .attr("transform", (d) => { const o = origin(d); return `translate(${o.y},${o.x})`; })
      .style("opacity", 0)
      .on("click", (e, d) => { e.stopPropagation(); onNodeClick(d.data.id); });

    enter.each(function (d) { buildNode(d3.select(this), d); });
    sel.each(function (d) { d3.select(this).selectAll("*").remove(); buildNode(d3.select(this), d); });

    enter.merge(sel)
      .attr("class", (d) => `node ${d.data.type}${d.data.id === selectedId ? " selected" : ""}${matchIds.has(d.data.id) ? " match" : ""}`)
      .transition(t)
      .attr("transform", (d) => `translate(${d.y},${d.x})`)
      .style("opacity", 1);

    sel.exit().transition(t).style("opacity", 0).remove();

    lastPos = new Map(nodes.map((d) => [d.data.id, { x: d.x, y: d.y }]));
    updateStats();
    if (focusId) centerOn(focusId);
  }

  function buildNode(g, d) {
    const n = d.data;
    const color = n.type === "root" ? "#1c1b19" : colorOf(n.id);
    if (n.type === "company") {
      const kind = statusKind(n.status);
      g.append("circle").attr("class", "logo-bg").attr("r", 13).attr("cx", 13).attr("cy", 0).style("stroke", n.id === selectedId ? color : null);
      const url = logoUrl(n, 64);
      if (url) {
        g.append("clipPath").attr("id", `clip-${n.id}`).append("circle").attr("r", 10).attr("cx", 13).attr("cy", 0);
        g.append("image").attr("href", url).attr("x", 3).attr("y", -10).attr("width", 20).attr("height", 20)
          .attr("clip-path", `url(#clip-${n.id})`)
          .on("error", function () { d3.select(this).remove(); g.append("text").attr("x", 13).attr("y", 4).attr("text-anchor", "middle").attr("font-size", 10).attr("font-weight", 700).style("fill", color).text(initials(n.name)); });
      }
      g.append("circle").attr("class", "status-dot").attr("r", 4).attr("cx", 23).attr("cy", 9).style("fill", STATUS_COLOR[kind]);
      g.append("text").attr("class", "label").attr("x", 32).attr("y", 4.5).text(n.name);
      g.append("title").text(`${n.name} — ${n.status || ""}`);
      return;
    }
    const w = nodeWidth(d);
    const isRoot = n.type === "root";
    const isOpen = isRoot || expanded.has(n.id);
    g.append("rect").attr("class", "pill").attr("x", 0).attr("y", -15).attr("width", w).attr("height", 30).attr("rx", 15)
      .style("stroke", color).style("fill", isRoot ? color : isOpen ? d3.color(color).copy({ opacity: 0.1 }) : "#fff");
    if (!isRoot) g.append("rect").attr("x", 9).attr("y", -5).attr("width", 10).attr("height", 10).attr("rx", 3).style("fill", color);
    g.append("text").attr("class", "label").attr("x", isRoot ? 16 : 26).attr("y", 4.5).text(n.name);
    if (!isRoot) {
      const c = countCompanies(n);
      g.append("text").attr("class", "count").attr("x", w - 26).attr("y", 4).attr("text-anchor", "end").style("fill", color).text(c);
      g.append("text").attr("class", "chev").attr("x", w - 16).attr("y", 4).attr("text-anchor", "middle").text(isOpen ? "◂" : "▸");
    }
  }

  function centerOn(id) {
    const p = lastPos.get(id); if (!p) return;
    const box = svg.node().getBoundingClientRect();
    const panelOpen = !$("#panel").hidden && window.innerWidth > 760;
    const usableW = box.width - (panelOpen ? 420 : 0);
    const k = d3.zoomTransform(svg.node()).k;
    const tx = usableW * 0.4 - p.y * k;
    const ty = box.height / 2 - p.x * k;
    svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(k));
  }

  function fitStart() {
    const box = svg.node().getBoundingClientRect();
    const k = box.width < 760 ? 0.7 : 1;
    svg.call(zoom.transform, d3.zoomIdentity.translate(30, box.height / 2).scale(k));
  }

  function updateStats() {
    const total = countCompanies(doc.tree);
    const verts = (doc.tree.children || []).length;
    let subs = 0; (doc.tree.children || []).forEach((v) => (v.children || []).forEach((c) => { if (c.type !== "company") subs++; }));
    $("#stats").textContent = `${verts} verticals · ${subs} subverticals · ${total} companies`;
  }

  // ───────── interaction ─────────
  function onNodeClick(id) {
    const n = byId.get(id);
    if (n.type !== "company" && n.type !== "root") {
      if (expanded.has(id)) {
        if (selectedId === id) { collapseBranch(n); }
      } else {
        // accordion: close siblings to keep the map readable
        const p = parentOf.get(id);
        (p?.children || []).forEach((s) => { if (s.id !== id) collapseBranch(s); });
        expanded.add(id);
      }
      saveExpanded();
    }
    select(id);
  }
  function collapseBranch(n) {
    expanded.delete(n.id);
    (n.children || []).forEach(collapseBranch);
  }
  function reveal(id) {
    pathTo(id).forEach((n) => { if (n.type !== "company" && n.type !== "root") expanded.add(n.id); });
    saveExpanded();
  }
  function select(id) {
    selectedId = id;
    render(id);
    renderPanel();
  }

  svg.on("click", () => { /* click on empty canvas keeps selection */ });

  // ───────── panel ─────────
  function renderPanel() {
    const panel = $("#panel");
    const n = byId.get(selectedId);
    if (!n) { panel.hidden = true; return; }
    panel.hidden = false;
    const color = n.type === "root" ? "#1c1b19" : colorOf(n.id);
    const crumbs = pathTo(n.id).slice(0, -1).map((p) => `<a data-go="${esc(p.id)}">${esc(p.name)}</a>`).join(" / ");
    let html = `<button class="close" aria-label="Close">×</button>`;
    if (crumbs) html += `<div class="crumbs">${crumbs}</div>`;
    if (editMode) html += `<span class="edit-flag">Editing</span>`;

    if (editMode) {
      html += n.type === "company" ? companyForm(n) : categoryForm(n);
    } else if (n.type === "company") {
      const kind = statusKind(n.status);
      const logo = logoUrl(n, 128);
      html += `<div class="p-head">
        ${logo ? `<img class="p-logo" src="${esc(logo)}" alt="" data-fallback="${esc(initials(n.name))}" data-color="${esc(color)}">` : `<div class="p-logo fallback" style="background:${color}">${esc(initials(n.name))}</div>`}
        <div><h2>${esc(n.name)}</h2>${n.domain ? `<a class="site" href="${esc(href(n.domain))}" target="_blank" rel="noopener">${esc(n.domain)} ↗</a>` : ""}</div>
      </div>`;
      if (n.status) html += `<span class="badge ${kind}">${esc(n.status)}</span>`;
      html += `<p class="desc">${esc(n.desc || "No description yet.")}</p>`;
      if (n.notes) html += `<div class="section-title">My notes</div><div class="notes">${esc(n.notes)}</div>`;
      const parent = parentOf.get(n.id);
      const peers = (parent?.children || []).filter((c) => c.type === "company" && c.id !== n.id);
      if (peers.length) html += `<div class="section-title">Also in ${esc(parent.name)}</div>${kidsList(peers)}`;
    } else {
      html += `<div class="p-head"><div class="p-swatch" style="background:${color}"></div><div><h2>${esc(n.name)}</h2>
        <span class="muted" style="font-size:13px">${countCompanies(n)} companies</span></div></div>`;
      html += `<p class="desc">${esc(n.desc || "")}</p>`;
      if (n.notes) html += `<div class="section-title">My notes</div><div class="notes">${esc(n.notes)}</div>`;
      const cats = (n.children || []).filter((c) => c.type !== "company");
      const cos = (n.children || []).filter((c) => c.type === "company");
      if (cats.length) html += `<div class="section-title">${n.type === "root" ? "Verticals" : "Subcategories"}</div>${kidsList(cats)}`;
      if (cos.length) html += `<div class="section-title">Companies</div>${kidsList(cos)}`;
    }
    panel.innerHTML = html;
    wirePanel(n);
  }

  function kidsList(items) {
    return `<ul class="kids">${items.map((c) => {
      if (c.type === "company") {
        const l = logoUrl(c, 64);
        return `<li data-go="${esc(c.id)}">${l ? `<img src="${esc(l)}" alt="">` : ""}<span>${esc(c.name)}</span><span class="k-status">${esc(c.status || "")}</span></li>`;
      }
      return `<li data-go="${esc(c.id)}"><span class="sw" style="background:${colorOf(c.id)}"></span><span>${esc(c.name)}</span><span class="k-count">${countCompanies(c)}</span></li>`;
    }).join("")}</ul>`;
  }

  function categoryOptions(excludeId) {
    const out = [];
    (function walk(n, depth) {
      if (n.type === "company") return;
      if (excludeId && n.id === excludeId) return; // can't move into itself/descendants
      out.push(`<option value="${esc(n.id)}">${"— ".repeat(depth)}${esc(n.name)}</option>`);
      (n.children || []).forEach((c) => walk(c, depth + 1));
    })(doc.tree, 0);
    return out.join("");
  }

  function companyForm(n) {
    return `<div class="form">
      <label>Name <input data-f="name" value="${esc(n.name)}"></label>
      <label>Website <span class="hint">Used for the logo, e.g. coreweave.com</span><input data-f="domain" value="${esc(n.domain || "")}"></label>
      <label>Status <span class="hint">e.g. "Public · NVDA", "Private", "Acquired by IBM (2026)", "Open source"</span><input data-f="status" value="${esc(n.status || "")}"></label>
      <label>What they do <textarea data-f="desc">${esc(n.desc || "")}</textarea></label>
      <label>My notes <span class="hint">Deals, interview angles, people you've met…</span><textarea data-f="notes">${esc(n.notes || "")}</textarea></label>
      <label>Custom logo URL <span class="hint">Optional — only if the automatic logo is wrong</span><input data-f="logo" value="${esc(n.logo || "")}"></label>
      <label>Move to <select data-move><option value="">Choose a category…</option>${categoryOptions()}</select></label>
      <div class="btn-row"><button class="danger" data-act="delete">Delete company</button></div>
    </div>`;
  }
  function categoryForm(n) {
    const isRoot = n.type === "root";
    const isVertical = parentOf.get(n.id) === doc.tree;
    return `<div class="form">
      <label>Name <input data-f="name" value="${esc(n.name)}"></label>
      <label>Description <textarea data-f="desc">${esc(n.desc || "")}</textarea></label>
      <label>My notes <textarea data-f="notes">${esc(n.notes || "")}</textarea></label>
      ${isVertical ? `<label>Color <input type="color" data-f="color" value="${esc(n.color || "#1c1b19")}"></label>` : ""}
      <div class="btn-row">
        <button class="primary" data-act="add-company">+ Add company</button>
        <button data-act="add-category">+ Add ${isRoot ? "vertical" : "subcategory"}</button>
      </div>
      ${isRoot ? "" : `<label>Move to <select data-move><option value="">Choose a category…</option>${categoryOptions(n.id)}</select></label>
      <div class="btn-row"><button class="danger" data-act="delete">Delete category</button></div>`}
    </div>`;
  }

  function wirePanel(n) {
    const panel = $("#panel");
    panel.querySelector(".close").onclick = () => { selectedId = null; panel.hidden = true; render(); };
    panel.querySelectorAll("[data-go]").forEach((el) => (el.onclick = () => { const id = el.dataset.go; reveal(id); const t = byId.get(id); if (t.type !== "company" && t.type !== "root") expanded.add(id); select(id); }));
    panel.querySelectorAll("img.p-logo").forEach((img) => (img.onerror = () => {
      const div = document.createElement("div"); div.className = "p-logo fallback"; div.style.background = img.dataset.color; div.textContent = img.dataset.fallback; img.replaceWith(div);
    }));
    panel.querySelectorAll(".kids img").forEach((img) => (img.onerror = () => (img.style.visibility = "hidden")));

    let renderTimer;
    panel.querySelectorAll("[data-f]").forEach((el) => {
      el.addEventListener("input", () => {
        const f = el.dataset.f; const v = el.value;
        if (v) n[f] = v; else delete n[f];
        if (!changes.includes(`Edit ${n.name}`)) markDirty(`Edit ${n.name}`); else saveDraft();
        clearTimeout(renderTimer);
        if (["name", "domain", "status", "logo", "color"].includes(f)) renderTimer = setTimeout(() => render(), 300);
      });
    });
    const mv = panel.querySelector("[data-move]");
    if (mv) mv.onchange = () => {
      const dest = byId.get(mv.value); if (!dest) return;
      const from = parentOf.get(n.id);
      from.children = from.children.filter((c) => c !== n);
      (dest.children = dest.children || []).push(n);
      index(); reveal(n.id); markDirty(`Move ${n.name} to ${dest.name}`);
      select(n.id); toast(`Moved to ${dest.name}`);
    };
    panel.querySelectorAll("[data-act]").forEach((b) => (b.onclick = () => act(b.dataset.act, n)));
  }

  function act(action, n) {
    if (action === "add-company" || action === "add-category") {
      const isCo = action === "add-company";
      const name = prompt(isCo ? "Company name?" : "Category name?");
      if (!name || !name.trim()) return;
      const node = isCo
        ? { id: newId(name), name: name.trim(), type: "company", domain: "", status: "Private", desc: "" }
        : { id: newId(name), name: name.trim(), type: "category", desc: "", children: [] };
      if (!isCo && n.type === "root") node.color = d3.schemeTableau10[(n.children || []).length % 10];
      (n.children = n.children || []).push(node);
      index(); expanded.add(n.id); reveal(node.id);
      markDirty(`Add ${node.name}`);
      select(node.id);
      setTimeout(() => $("#panel [data-f=\"" + (isCo ? "domain" : "desc") + "\"]")?.focus(), 50);
    } else if (action === "delete") {
      const what = n.type === "company" ? n.name : `${n.name} and everything inside it (${countCompanies(n)} companies)`;
      if (!confirm(`Delete ${what}?`)) return;
      const p = parentOf.get(n.id);
      p.children = p.children.filter((c) => c !== n);
      collapseBranch(n); index();
      markDirty(`Delete ${n.name}`);
      select(p.id);
    }
  }

  // ───────── search ─────────
  const searchEl = $("#search"), resultsEl = $("#results");
  let activeIdx = -1, resultIds = [];
  searchEl.addEventListener("input", () => {
    const q = searchEl.value.trim().toLowerCase();
    matchIds = new Set(); resultIds = []; activeIdx = -1;
    if (!q) { resultsEl.hidden = true; render(); return; }
    const scored = [];
    byId.forEach((n) => {
      if (n.type === "root") return;
      const name = n.name.toLowerCase();
      let s = name === q ? 100 : name.startsWith(q) ? 80 : name.includes(q) ? 60 : 0;
      if (!s && ((n.desc || "").toLowerCase().includes(q) || (n.notes || "").toLowerCase().includes(q) || (n.status || "").toLowerCase().includes(q))) s = 20;
      if (s) scored.push([s + (n.type === "company" ? 1 : 0), n]);
    });
    scored.sort((a, b) => b[0] - a[0]);
    const top = scored.slice(0, 30).map((x) => x[1]);
    resultIds = top.map((n) => n.id);
    top.forEach((n) => matchIds.add(n.id));
    resultsEl.innerHTML = top.length ? top.map((n, i) => {
      const where = pathTo(n.id).slice(1, -1).map((p) => p.name).join(" › ");
      const icon = n.type === "company" && logoUrl(n) ? `<img src="${esc(logoUrl(n))}" alt="">` : `<span class="dot" style="background:${colorOf(n.id)}"></span>`;
      return `<li data-i="${i}">${icon}<div><div>${esc(n.name)}</div><div class="r-path">${esc(where || "Vertical")}</div></div></li>`;
    }).join("") : `<li class="muted">No matches</li>`;
    resultsEl.hidden = false;
    resultsEl.querySelectorAll("img").forEach((img) => (img.onerror = () => (img.style.visibility = "hidden")));
    resultsEl.querySelectorAll("li[data-i]").forEach((li) => (li.onmousedown = (e) => { e.preventDefault(); goResult(+li.dataset.i); }));
  });
  searchEl.addEventListener("keydown", (e) => {
    if (resultsEl.hidden) return;
    const items = resultsEl.querySelectorAll("li[data-i]");
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      activeIdx = Math.max(0, Math.min(items.length - 1, activeIdx + (e.key === "ArrowDown" ? 1 : -1)));
      items.forEach((li, i) => li.classList.toggle("active", i === activeIdx));
      items[activeIdx]?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") { goResult(activeIdx < 0 ? 0 : activeIdx); }
    else if (e.key === "Escape") { resultsEl.hidden = true; }
  });
  searchEl.addEventListener("blur", () => setTimeout(() => (resultsEl.hidden = true), 120));
  function goResult(i) {
    const id = resultIds[i]; if (!id) return;
    resultsEl.hidden = true;
    reveal(id);
    const n = byId.get(id);
    if (n.type !== "company") expanded.add(id);
    select(id);
  }

  // ───────── toolbar ─────────
  $("#btn-collapse").onclick = () => { expanded.clear(); saveExpanded(); selectedId = null; $("#panel").hidden = true; render(); fitStart(); };
  $("#btn-edit").onclick = () => {
    editMode = !editMode;
    $("#btn-edit").classList.toggle("on", editMode);
    $("#btn-edit").textContent = editMode ? "Done editing" : "Edit";
    if (editMode && !selectedId) selectedId = doc.tree.id;
    renderPanel(); render();
  };
  $("#btn-settings").onclick = openSettings;
  $("#btn-save").onclick = saveToGitHub;

  function openSettings() {
    const s = getSettings(), f = $("#settings form");
    f.owner.value = s.owner || ""; f.repo.value = s.repo || ""; f.branch.value = s.branch || "main"; f.token.value = s.token || "";
    $("#settings").showModal();
  }
  $("#settings").addEventListener("close", () => {
    if ($("#settings").returnValue !== "save") return;
    const f = $("#settings form");
    const s = { owner: f.owner.value.trim(), repo: f.repo.value.trim(), branch: f.branch.value.trim() || "main", token: f.token.value.trim() };
    try { localStorage.setItem(LS_SETTINGS, JSON.stringify(s)); } catch {}
    toast("Settings saved");
    if (pendingSave) { pendingSave = false; saveToGitHub(); }
  });

  // ───────── GitHub save ─────────
  let pendingSave = false;
  function b64(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  async function saveToGitHub() {
    const s = getSettings();
    if (!s.owner || !s.repo || !s.token) { pendingSave = true; openSettings(); return; }
    const btn = $("#btn-save"); btn.disabled = true; btn.textContent = "Saving…";
    const api = `https://api.github.com/repos/${encodeURIComponent(s.owner)}/${encodeURIComponent(s.repo)}/contents/${DATA_PATH}`;
    const headers = { Authorization: `Bearer ${s.token}`, Accept: "application/vnd.github+json" };
    try {
      doc.meta = doc.meta || {};
      doc.meta.updated = new Date().toISOString().slice(0, 10);
      const cur = await fetch(`${api}?ref=${encodeURIComponent(s.branch)}`, { headers, cache: "no-store" });
      if (cur.status === 401 || cur.status === 403) throw new Error("GitHub rejected the token — check it has Contents: Read and write on this repo.");
      const sha = cur.ok ? (await cur.json()).sha : undefined;
      const summary = changes.length ? changes.slice(0, 6).join("; ") + (changes.length > 6 ? ` (+${changes.length - 6} more)` : "") : "Update landscape";
      const res = await fetch(api, {
        method: "PUT", headers,
        body: JSON.stringify({ message: summary.slice(0, 200), content: b64(JSON.stringify(doc, null, 1) + "\n"), sha, branch: s.branch }),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.message || `GitHub error ${res.status}`); }
      dirty = false; changes = []; clearDraft();
      btn.hidden = true;
      toast("Saved to GitHub ✓ — the live site updates in about a minute.", false, 5000);
    } catch (err) {
      toast(err.message || String(err), true, 7000);
      btn.textContent = `Save to GitHub (${changes.length || "•"})`;
    } finally { btn.disabled = false; }
  }

  window.addEventListener("beforeunload", (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } });
  window.addEventListener("resize", () => { if (selectedId) centerOn(selectedId); });

  // ───────── boot ─────────
  function showDraftBanner(draft) {
    const b = $("#banner");
    const when = new Date(draft.at).toLocaleString();
    b.innerHTML = `<span>You have unsaved edits from ${esc(when)} in this browser.</span>
      <button class="primary" data-b="restore">Restore them</button><button data-b="discard">Discard</button>`;
    b.hidden = false;
    b.querySelector('[data-b="restore"]').onclick = () => {
      doc = draft.doc; changes = draft.changes || []; index(); markDirty(); b.hidden = true; render(); renderPanel(); toast("Edits restored — click Save to GitHub to publish them.");
    };
    b.querySelector('[data-b="discard"]').onclick = () => { clearDraft(); b.hidden = true; };
  }

  async function boot() {
    try {
      const res = await fetch(`${DATA_PATH}?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Couldn't load ${DATA_PATH} (${res.status})`);
      doc = await res.json();
    } catch (err) {
      document.querySelector("main").innerHTML = `<p style="padding:40px">${esc(err.message)}. If you opened index.html straight from your computer, run it through a local server or GitHub Pages instead.</p>`;
      return;
    }
    index();
    $("#title").textContent = doc.meta?.title || "Tech Landscape";
    $("#subtitle").textContent = doc.meta?.subtitle || "";
    $("#note").textContent = [doc.meta?.updated ? `Updated ${doc.meta.updated}` : "", doc.meta?.note || ""].filter(Boolean).join(" · ");
    document.title = `${doc.meta?.title || "Tech Landscape"} — ${doc.meta?.subtitle || ""}`;
    try { JSON.parse(localStorage.getItem(LS_EXPANDED) || "[]").forEach((id) => byId.has(id) && expanded.add(id)); } catch {}
    try { const d = JSON.parse(localStorage.getItem(LS_DRAFT) || "null"); if (d && d.doc) showDraftBanner(d); } catch {}
    fitStart();
    render();
    // re-measure once web fonts arrive so pills fit their labels
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { measureCache.clear(); render(); });
  }
  boot();
})();

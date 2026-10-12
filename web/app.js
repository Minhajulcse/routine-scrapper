"use strict";
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ic = p => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const ICON = {
  room: ic('<path d="M5 21V4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v17"/><path d="M3 21h18"/><circle cx="15" cy="12" r=".8" fill="currentColor"/>'),
  user: ic('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>'),
  cap: ic('<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2 9 2 12 0v-5"/>'),
  pdf: ic('<path d="M12 3v12m0 0l-4.5-4.5M12 15l4.5-4.5"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>'),
  img: ic('<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-9 9"/>'),
  share: ic('<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4"/>'),
};
const SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu"];
const TABS = ["schedule", "teachers", "rooms", "dev"];
const KEY = "routine.filter.v1";
let D, S = { mode: "class", batch: "1-I", section: "A", teacher: null, room: null, day: 0, rDay: 0, rSlot: 0, tab: "schedule" };

// ---------- helpers ----------
const mins = t => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const t12 = t => { let [h, m] = t.split(":").map(Number); const p = h >= 12 ? "PM" : "AM"; h = h % 12 || 12; return `${h}:${String(m).padStart(2, "0")} ${p}`; };
const t12s = t => t12(t).replace(/ [AP]M$/, "");
const tAP = t => (+t.split(":")[0] >= 12 ? "PM" : "AM");
const range = e => `${t12(e.start)} – ${t12(e.end)}`;
const codeFmt = c => c.replace(/^(LAW|GED)(\d)/, "$1 $2");
const todayIdx = () => { const d = new Date().getDay(); return d <= 4 ? d : -1; };
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const batches = () => [...new Set(D.classes.map(c => c.batch).filter(Boolean))].sort();
const sectionsOf = b => [...new Set(D.classes.filter(c => c.batch === b && c.section).map(c => c.section))].sort();
const teacherName = i => D.teachers[i]?.name || i || "";
const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ mode: S.mode, batch: S.batch, section: S.section, teacher: S.teacher, room: S.room })); } catch { } };
const dateOf = i => { const d = new Date(), w = d.getDay(); d.setDate(d.getDate() - w + i + (w > 4 ? 7 : 0)); return d.getDate(); };

function matches(c) {
  if (S.mode === "teacher") return c.teacher === S.teacher;
  if (S.mode === "room") return c.room === S.room;
  return c.batch === S.batch && (!c.section || !S.section || c.section === S.section);
}
function label() {
  if (S.mode === "teacher") return S.teacher ? `${teacherName(S.teacher)} (${S.teacher})` : "Select a teacher";
  if (S.mode === "room") return S.room ? `Room ${S.room}` : "Select a room";
  return `Batch ${S.batch}${S.section ? " · Section " + S.section : ""}`;
}

// ---------- next / live class ----------
function nextUp() {
  const mine = D.classes.filter(matches).sort((a, b) => a.day - b.day || mins(a.start) - mins(b.start));
  if (!mine.length) return null;
  const t = todayIdx(), nm = nowMin();
  if (t !== -1) {
    const live = mine.find(c => c.day === t && mins(c.start) <= nm && nm < mins(c.end));
    if (live) return { kind: "live", c: live, left: mins(live.end) - nm };
    const nx = mine.find(c => c.day === t && mins(c.start) > nm);
    if (nx) return { kind: "next", c: nx, when: `in ${dur(mins(nx.start) - nm)}`, day: "Today" };
  }
  const order = t === -1 ? [0, 1, 2, 3, 4] : [1, 2, 3, 4, 0].map(k => (t + k) % 5);
  for (const d of order) {
    const c = mine.find(x => x.day === d);
    if (c) return { kind: "next", c, when: `${D.meta.days[d]} · ${t12(c.start)}`, day: d === t + 1 ? "Tomorrow" : D.meta.days[d] };
  }
  return null;
}
const dur = m => m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? " " + (m % 60) + "m" : ""}` : `${m} min`;

function renderNext() {
  const el = $("#next"), n = nextUp();
  if (!n) { el.className = "next none"; el.disabled = true; el.innerHTML = `<span class="c">No classes found</span><span class="m">Nothing is scheduled for this selection.</span>`; return; }
  el.disabled = false; el.dataset.day = n.c.day;
  const c = n.c, meta = [c.room && `Room ${esc(c.room)}`, c.teacher && esc(c.teacher), S.mode !== "class" && esc(c.batch + (c.section ? " " + c.section : ""))].filter(Boolean).join(" · ");
  el.className = "next " + (n.kind === "live" ? "live" : "");
  el.innerHTML = `<span class="k"><i class="dot"></i>${n.kind === "live" ? `In progress · ${dur(n.left)} left` : `Up next · ${esc(n.when)}`}</span>
    <span class="c">${esc(codeFmt(c.course_code))}</span><span class="m">${meta}</span>`;
}
$("#next").onclick = e => { const d = e.currentTarget.dataset.day; if (d === undefined) return; S.day = +d; renderSchedule(); $("#days").scrollIntoView({ block: "start", behavior: "smooth" }); };

// ---------- schedule ----------
function renderDays(el, sel, onPick, has) {
  const t = todayIdx();
  el.innerHTML = D.meta.days.map((d, i) =>
    `<button class="day ${i === sel ? "sel" : ""} ${i === t ? "today" : ""} ${has?.(i) ? "has" : ""}" data-d="${i}" aria-label="${d}" aria-pressed="${i === sel}">${SHORT[i]}<b>${dateOf(i)}</b></button>`).join("");
  el.querySelectorAll(".day").forEach(b => b.onclick = () => onPick(+b.dataset.d));
}

function card(c, now) {
  const live = now && mins(c.start) <= now.m && now.m < mins(c.end);
  const past = now && mins(c.end) <= now.m;
  const bt = `${c.batch}${c.section ? " · " + c.section : ""}`;
  return `<article class="card y${c.year} ${live ? "live" : ""} ${past ? "past" : ""}">
    <div class="row"><div><span class="code">${esc(codeFmt(c.course_code))}</span>${c.starred ? '<span class="badge" title="Marked * on the official routine">Inter-dept</span>' : ""}
      ${c.course_name ? `<div class="cname">${esc(c.course_name)}</div>` : ""}</div>${live ? '<span class="badge live">Live</span>' : ""}</div>
    <div class="meta">
      ${c.room ? `<button class="chip" data-room="${esc(c.room)}" aria-label="Room ${esc(c.room)}">${ICON.room}Room ${esc(c.room)}</button>` : ""}
      ${c.teacher ? `<button class="chip" data-teacher="${esc(c.teacher)}">${ICON.user}${esc(c.teacher)}</button>` : ""}
      ${S.mode !== "class" ? `<button class="chip" data-batch="${esc(c.batch)}" data-sec="${esc(c.section || "")}">${ICON.cap}${esc(bt)}</button>` : ""}
    </div>
    <div class="who">${esc(teacherName(c.teacher))}${c.note ? " · " + esc(c.note) : ""}</div></article>`;
}

function renderSchedule() {
  const mine = D.classes.filter(matches);
  renderDays($("#days"), S.day, i => { S.day = i; renderSchedule(); }, i => mine.some(c => c.day === i));
  $("#filterLabel").textContent = label();
  renderNext();
  const items = mine.filter(c => c.day === S.day).sort((a, b) => mins(a.start) - mins(b.start));
  const t = todayIdx(), now = t === S.day ? { m: nowMin() } : null;
  if (!items.length) {
    $("#list").innerHTML = `<div class="empty"><b>No classes</b>Nothing is scheduled on ${D.meta.days[S.day]}${S.mode === "class" ? "" : " for this selection"}.</div>`;
    return;
  }
  const groups = [];
  for (const c of items) { const k = c.start + c.end, g = groups[groups.length - 1]; if (g && g.k === k) g.items.push(c); else groups.push({ k, s: c.start, e: c.end, items: [c] }); }
  let html = "", n = 0;
  groups.forEach((g, gi) => {
    const prev = groups[gi - 1];
    if (prev && mins(g.s) >= 14 * 60 && mins(prev.e) <= 13 * 60 + 30) html += `<div class="brk" style="--i:${n++}">Break · 1:30 – 2:00 PM</div>`;
    const live = now && mins(g.s) <= now.m && now.m < mins(g.e);
    html += `<div class="tl ${live ? "now" : ""}" style="--i:${n++}"><div class="rail"><b>${t12s(g.s)}</b><small>${tAP(g.s)}</small><em>to ${t12s(g.e)}</em></div><div class="stack">${g.items.map(c => card(c, now)).join("")}</div></div>`;
  });
  $("#list").innerHTML = html;
}
$("#list").addEventListener("click", e => {
  const b = e.target.closest(".chip"); if (!b) return;
  if (b.dataset.room) S = { ...S, mode: "room", room: b.dataset.room };
  else if (b.dataset.teacher) S = { ...S, mode: "teacher", teacher: b.dataset.teacher };
  else if (b.dataset.batch) S = { ...S, mode: "class", batch: b.dataset.batch, section: b.dataset.sec || sectionsOf(b.dataset.batch)[0] || null };
  save(); renderSchedule(); $("#main").scrollTo({ top: 0 });
});

// ---------- faculty ----------
function renderTeachers() {
  const q = $("#tSearch").value.trim().toLowerCase();
  const counts = {}; D.classes.forEach(c => c.teacher && (counts[c.teacher] = (counts[c.teacher] || 0) + 1));
  const by = {};
  Object.entries(D.teachers).filter(([i, t]) => counts[i] && (!q || i.toLowerCase().includes(q) || t.name.toLowerCase().includes(q)))
    .sort((a, b) => a[1].name.localeCompare(b[1].name)).forEach(e => (by[e[1].group] ||= []).push(e));
  const order = ["In-House", "Inter-Department", "Adjunct", "Placeholder", "Unknown"]; let n = 0;
  $("#tList").innerHTML = order.filter(g => by[g]).map(g => `<div class="grp">${esc(g)}</div>` + by[g].map(([i, t]) =>
    `<button class="person" style="--i:${n++}" data-t="${esc(i)}"><span class="av">${esc(i)}</span><span>${esc(t.name)}<small>${esc(t.title)}</small></span><em>${counts[i]} / wk</em></button>`).join("")).join("")
    || `<div class="empty"><b>No results</b>Try a different name or initial.</div>`;
}
$("#tSearch").oninput = renderTeachers;
$("#tList").addEventListener("click", e => {
  const b = e.target.closest(".person"); if (!b) return;
  S = { ...S, mode: "teacher", teacher: b.dataset.t }; save(); go("schedule");
});

// ---------- rooms ----------
function renderRooms() {
  renderDays($("#rDays"), S.rDay, i => { S.rDay = i; renderRooms(); }, i => D.classes.some(c => c.day === i));
  $("#rSlots").innerHTML = D.meta.slots.map(s => `<button class="chip ${s.id === S.rSlot ? "sel" : ""}" data-s="${s.id}">${t12s(s.start)} – ${t12s(s.end)}</button>`).join("");
  const slot = D.meta.slots[S.rSlot], s0 = mins(slot.start), s1 = mins(slot.end);
  const busy = new Map();
  D.classes.filter(c => c.day === S.rDay && c.room && mins(c.start) < s1 && mins(c.end) > s0).forEach(c => busy.set(c.room, c));
  const free = (D.vacant_rooms.find(v => v.day === S.rDay && v.slot === S.rSlot)?.rooms || []).filter(r => !busy.has(r));
  $("#rFree").innerHTML = free.map(r => `<button class="chip free" data-room="${r}">${r}</button>`).join("") || `<span class="chip dim">None listed</span>`;
  $("#rBusy").innerHTML = [...busy].sort().map(([r, c]) => `<button class="chip" data-room="${r}">${r}<span class="dim" style="color:var(--mute);font-weight:500">${esc(codeFmt(c.course_code))}</span></button>`).join("") || `<span class="chip dim">Nothing scheduled</span>`;
}
$("#rSlots").addEventListener("click", e => { const b = e.target.closest("[data-s]"); if (b) { S.rSlot = +b.dataset.s; renderRooms(); } });
$("#tab-rooms").addEventListener("click", e => {
  const b = e.target.closest("[data-room]"); if (!b) return;
  S = { ...S, mode: "room", room: b.dataset.room, day: S.rDay }; save(); go("schedule");
});

// ---------- bottom sheet (selection + export) ----------
const sheet = $("#sheet"), scrim = $("#scrim");
let sheetKind = null, expToken = 0;
function openSheet(kind) {
  sheetKind = kind; (kind === "filter" ? drawFilter : drawExport)();
  scrim.classList.add("show"); sheet.classList.add("open"); sheet.setAttribute("aria-hidden", "false");
}
function closeSheet() { expToken++; scrim.classList.remove("show"); sheet.classList.remove("open"); sheet.setAttribute("aria-hidden", "true"); sheetKind = null; }

function drawFilter() {
  const chip = (attr, v, on, txt) => `<button class="chip ${on ? "sel" : ""}" ${attr}="${esc(v)}">${esc(txt ?? v)}</button>`;
  let h = `<div class="seg" id="modeSeg">${["class", "teacher", "room"].map(m => `<button data-mode="${m}" class="${m === S.mode ? "on" : ""}">${m[0].toUpperCase() + m.slice(1)}</button>`).join("")}</div>`;
  if (S.mode === "class") {
    h += `<h3>Batch (year – semester)</h3><div class="chips">${batches().map(b => chip("data-b", b, b === S.batch)).join("")}</div><h3>Section</h3>`;
    const secs = sectionsOf(S.batch);
    h += secs.length ? `<div class="chips">${secs.map(x => chip("data-sec", x, x === S.section, "Section " + x)).join("")}</div>` : `<p>This batch is not divided into sections.</p>`;
  } else if (S.mode === "teacher") {
    h += `<h3>Teacher</h3><div class="chips">${[...new Set(D.classes.map(c => c.teacher).filter(Boolean))].sort().map(t => chip("data-t", t, t === S.teacher)).join("")}</div>`;
  } else {
    h += `<h3>Room</h3><div class="chips">${[...new Set(D.classes.map(c => c.room).filter(Boolean))].sort().map(r => chip("data-r", r, r === S.room)).join("")}</div>`;
  }
  $("#sheetBody").innerHTML = h;
}
$("#sheetBody").onclick = e => {
  if (sheetKind === "export") return exportClick(e);
  const m = e.target.closest("[data-mode]");
  if (m) {
    S.mode = m.dataset.mode;
    if (S.mode === "teacher" && !S.teacher) S.teacher = Object.keys(D.teachers).find(t => D.classes.some(c => c.teacher === t));
    if (S.mode === "room" && !S.room) S.room = D.classes.find(c => c.room)?.room;
    drawFilter(); save(); renderSchedule(); return;
  }
  const b = e.target.closest(".chip"); if (!b) return;
  if (b.dataset.b) { S.batch = b.dataset.b; S.section = sectionsOf(S.batch)[0] || null; drawFilter(); save(); renderSchedule(); return; }
  if (b.dataset.sec) S.section = b.dataset.sec;
  if (b.dataset.t) S.teacher = b.dataset.t;
  if (b.dataset.r) S.room = b.dataset.r;
  save(); renderSchedule(); closeSheet();
};
$("#filterBtn").onclick = () => openSheet("filter"); scrim.onclick = closeSheet;

// ---------- export: PDF / image of the selected class, teacher or room ----------
let pages = null;
const fileBase = () => `BAIUST Routine - ${D.meta.semester || ""} - ${label().replace(/[^\w\- ]+/g, "").replace(/\s+/g, " ").trim()}`.replace(/ - +-/g, " -");
const loadLogo = () => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = "icons/baiust-logo.png"; });

function exportData() {
  const mine = D.classes.filter(matches);
  const eff = D.meta.effective_from && new Date(D.meta.effective_from + "T00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const p12 = t => { let [h, m] = t.split(":").map(Number); h = h % 12 || 12; return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0"); };
  const rows = [];
  D.meta.days.forEach((d, di) => {
    mine.filter(c => c.day === di).sort((a, b) => mins(a.start) - mins(b.start) || String(a.batch).localeCompare(b.batch)).forEach((c, k) => {
      const tag = `${c.batch}${c.section ? "_" + c.section : ""}`;
      rows.push({
        day: d, first: k === 0,
        course: `${c.course_name ? c.course_name + " - " : ""}${codeFmt(c.course_code)}${c.starred ? " *" : ""}(${tag})`,
        sub: c.note || "", time: `${p12(c.start)}-${p12(c.end)}`, room: c.room || "—", teacher: c.teacher || "—",
      });
    });
  });
  const gOrder = ["In-House", "Inter-Department", "Adjunct", "Unknown"];
  const faculty = [...new Set(mine.map(c => c.teacher).filter(t => t && t !== "TBD"))]
    .map(i => ({ ini: i, name: D.teachers[i]?.name || i, title: D.teachers[i]?.title || "", g: gOrder.indexOf(D.teachers[i]?.group) }))
    .sort((a, b) => (a.g < 0 ? 9 : a.g) - (b.g < 0 ? 9 : b.g) || a.name.localeCompare(b.name));
  const tag = S.mode === "class" ? `${S.batch}${S.section ? "_" + S.section : ""}` : null;
  return {
    title: S.mode === "teacher" ? `Teacher Schedule : ${teacherName(S.teacher)} (${S.teacher})` : S.mode === "room" ? `Room Schedule : ${S.room}` : `Class Schedule : ${tag}`,
    subtitle: [D.meta.semester, eff && `Effective from ${eff}`].filter(Boolean).join("  ·  "),
    semester: D.meta.semester, rows, faculty,
    note: mine.some(c => c.starred) ? "* Course taught by an inter-department teacher, as marked on the official routine." : "",
    generated: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
  };
}

function drawExport() {
  const my = ++expToken; pages = null;
  $("#sheetBody").innerHTML = `<h2>Download routine</h2><p>${esc(label())}</p>
    <div class="preview" id="pv"><span>Preparing preview…</span></div>
    <button class="btn primary" data-x="pdf" disabled>${ICON.pdf}Download PDF</button>
    <button class="btn ghost" data-x="png" disabled>${ICON.img}Save as image</button>
    ${navigator.canShare ? `<button class="btn ghost" data-x="share" disabled>${ICON.share}Share</button>` : ""}
    <div class="status" id="xs" aria-live="polite"></div>`;
  loadLogo().then(logo => {
    if (my !== expToken) return;
    if (!logo) { $("#pv").innerHTML = "<span>Could not load the logo.</span>"; return; }
    pages = Export.render(exportData(), logo);
    const pv = $("#pv"); pv.innerHTML = ""; pv.appendChild(pages[0]);
    $("#sheetBody").querySelectorAll("[data-x]").forEach(b => b.disabled = false);
  });
}
function saveBlob(blob, name) {
  const a = document.createElement("a"), u = URL.createObjectURL(blob);
  a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 4000);
}
async function exportClick(e) {
  const b = e.target.closest("[data-x]"); if (!b || !pages) return;
  const st = $("#xs"), kind = b.dataset.x, base = fileBase();
  try {
    st.textContent = "Creating file…";
    if (kind === "pdf") { saveBlob(Export.toPDF(pages), base + ".pdf"); st.textContent = "PDF saved to your downloads."; }
    else if (kind === "png") {
      for (let i = 0; i < pages.length; i++) saveBlob(await Export.toPNG(pages[i]), `${base}${pages.length > 1 ? " p" + (i + 1) : ""}.png`);
      st.textContent = "Image saved to your downloads.";
    } else {
      const file = new File([Export.toPDF(pages)], base + ".pdf", { type: "application/pdf" });
      if (navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: base }); st.textContent = ""; }
      else st.textContent = "Sharing files isn't supported here — use Download PDF.";
    }
  } catch (err) { st.textContent = err?.name === "AbortError" ? "" : "Something went wrong. Please try again."; }
}
$("#exportBtn").onclick = () => openSheet("export");

// ---------- tabs / boot ----------
function go(tab) {
  S.tab = tab;
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.id === "tab-" + tab));
  document.querySelectorAll(".bottom button").forEach(b => b.classList.toggle("on", b.dataset.tab === tab));
  $(".ind").style.setProperty("--n", TABS.indexOf(tab));
  if (tab === "schedule") renderSchedule(); if (tab === "teachers") renderTeachers(); if (tab === "rooms") renderRooms();
  $("#main").scrollTo({ top: 0 });
}
$("#bottom").onclick = e => { const b = e.target.closest("button"); if (b) go(b.dataset.tab); };

async function boot() {
  try { D = await (await fetch("data/routine.json", { cache: "no-cache" })).json(); }
  catch { $("#list").innerHTML = `<div class="empty"><b>Unable to load</b>Open the app once while online.</div>`; return; }
  try { Object.assign(S, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch { }
  if (!batches().includes(S.batch)) S.batch = batches()[0];
  if (S.mode === "class" && S.section && !sectionsOf(S.batch).includes(S.section)) S.section = sectionsOf(S.batch)[0] || null;
  const t = todayIdx(); S.day = t === -1 ? 0 : t;
  const mine = D.classes.filter(matches);                       // land on the next day that has classes
  for (let k = 0; k < 5 && !mine.some(c => c.day === S.day); k++) S.day = (S.day + 1) % 5;
  S.rDay = S.day;
  const nm = nowMin(); S.rSlot = Math.max(0, D.meta.slots.findIndex(s => nm < mins(s.end)));
  const eff = D.meta.effective_from && new Date(D.meta.effective_from + "T00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  $("#sub").textContent = `Dept. of Law · ${D.meta.semester || ""}`;
  go("schedule");
  setInterval(() => { if (S.tab === "schedule") renderNext(); }, 60000);   // keep the live/next card in sync
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => { });
}
boot();

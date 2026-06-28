'use client';

import { useEffect, useRef } from 'react';
import Papa from 'papaparse';
import html2canvas from 'html2canvas';
import JSZip from 'jszip';

const CONTROL_MARKUP = `<div class="panel">
    <div class="panel-head">
      <h2>Mesh Super God Mode — Mega</h2>
      <button class="mobile-panel-toggle" id="mobilePanelToggle" type="button" aria-expanded="false">EXPAND</button>
    </div>

    <div class="section">
      <h3>Mode</h3>
      <div class="seg" id="modeSeg">
        <button class="active" data-mode="month">MONTH</button>
        <button data-mode="week">WEEK</button>
        <button data-mode="day">DAY</button>
        <button data-mode="tonight">TONIGHT</button>
        <button data-mode="lineup">LINEUP</button>
      </div>
    </div>

    <div class="section">
      <h3>Navigation</h3>
      <div class="row">
        <button id="prevBtn">PREV</button>
        <button id="todayBtn">TODAY</button>
        <button id="nextBtn">NEXT</button>
      </div>
    </div>

    <div class="section">
      <h3>Export / Motion</h3>
      <div class="row">
        <button id="pngBtn">EXPORT PNG</button>
        <button id="transparentPngBtn">EXPORT ALPHA PNG</button>
        <button id="packBtn">EXPORT PACK ZIP</button>
        <button id="videoBtn">RENDER VIDEO</button>
        <button id="loopBtn">START LOOP</button>
      </div>
      <label><input type="checkbox" id="videoPreviewToggle" checked> Preview over background video</label>
      <label><input type="checkbox" id="transparentToggle"> Transparent preview</label>
      <label><input type="checkbox" id="animateToggle" checked> Animate content in</label>
      <div class="small">Alpha PNG forces a transparent export even if the preview is black.</div>
    </div>

    <div class="section">
      <h3>Background</h3>
      <label><input type="checkbox" id="meshToggle"> Mesh animated background</label>
      <label><input type="checkbox" id="blurToggle"> Blur mesh</label>
      <label><input type="checkbox" id="overlayToggle" checked> Dark overlay on top of mesh</label>
      <div class="row">
        <input type="color" id="color1" value="#ff5a00">
        <input type="color" id="color2" value="#ff1f00">
        <input type="color" id="color3" value="#120000">
        <input type="color" id="color4" value="#000000">
      </div>
      <div class="range-line">
        <span class="small">Mesh speed</span>
        <input type="range" id="meshSpeedRange" min="1" max="30" value="10">
        <span class="small" id="meshSpeedValue">10</span>
      </div>
    </div>

    <div class="section">
      <h3>Edit Selected Item</h3>
      <div class="selected" id="selectedInfo">Click a row or card in the preview to edit it.</div>

      <div class="field"><span>Show title</span><input id="editTitle"></div>
      <div class="field"><span>DJ</span><input id="editDJ"></div>
      <div class="field"><span>Guest DJ</span><input id="editGuestDJ"></div>
      <div class="field"><span>Guest MC</span><input id="editGuestMC"></div>
      <div class="field"><span>Genre</span><textarea id="editGenre"></textarea></div>
      <div class="field"><span>Date</span><input id="editDate" type="date"></div>
      <div class="field"><span>Time range</span><input id="editTime" placeholder="19:00-20:00"></div>

      <label><input type="checkbox" id="editUseWith" checked> Use “w/” before DJ</label>
      <label><input type="checkbox" id="editFeatured"> Featured show</label>
      <label><input type="checkbox" id="editHidden"> Hide this show</label>

      <div class="row">
        <button id="saveEditBtn">SAVE OVERRIDE</button>
        <button id="clearEditBtn">CLEAR ITEM OVERRIDE</button>
      </div>
    </div>

    <div class="section">
      <h3>Local Overrides</h3>
      <div class="small">Overrides stay in this browser only, layered on top of the live sheet.</div>
      <div class="row" style="margin-top:10px;">
        <button class="danger" id="resetOverridesBtn">RESET ALL OVERRIDES</button>
      </div>
      <div class="footer-note">Layout is locked for 9:16 video renders. Edit the schedule, choose a mode, then render.</div>
    </div>
  </div>

  <div class="preview-shell">
    <div class="preview-frame" id="previewFrame">
      <div class="preview-viewport" id="previewViewport"></div>
    </div>
  </div>

  <div id="exportStage"></div>`;

export default function ScheduleOverlayApp() {
  const rootRef = useRef(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || root.dataset.initialized === 'true') return;
    root.dataset.initialized = 'true';

    const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTavGvSojxM1vYpMv0FSoC-WzIK3IqTYPNl1SYbya4iV8VJUaEmHso7yghmGQPLJvwpsEMzKjbonPDz/pub?output=csv";
    const BACKGROUND_VIDEO_URL = "/schedule-background.mp4";
    const STORAGE_KEY = "mesh_schedule_overrides_v5";
    const UI_KEY = "mesh_schedule_ui_v5";
    const LOCKED_LAYOUT = {
      showTime:true,
      showGenre:true,
      showGuests:true,
      monthLabelOverride:"",
      dayScale:100,
      monthScale:100,
      weekScale:100,
      lineupScale:100,
      showSafeZone:false,
      showContentBox:false,
      extraDayPadding:true,
      autoFit:true,
      safeTop:140,
      safeBottom:180,
      safeSides:40,
      padTop:180,
      padBottom:250,
      padSides:78,
      innerBuffer:24
    };
    
    let ALL_ROWS = [];
    let OVERRIDES = loadOverrides();
    let UI = loadUIState();
    let MODE = "month";
    let LOOPING = false;
    let loopTimer = null;
    let SELECTED_ID = null;
    let currentMonthDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    let currentWeekDate = new Date();
    let currentDayDate = new Date();
    
    function loadOverrides(){
      try{ return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); }
      catch{ return {}; }
    }
    
    function saveOverrides(){
      localStorage.setItem(STORAGE_KEY, JSON.stringify(OVERRIDES));
    }
    
    function loadUIState(){
      const defaults = {
        videoPreview:true,
        transparent:false,
        animate:true,
        mesh:false,
        blur:false,
        overlay:true,
        meshSpeed:10,
        color1:"#ff5a00",
        color2:"#ff1f00",
        color3:"#120000",
        color4:"#000000",
        ...LOCKED_LAYOUT
      };

      try{
        return {
          ...defaults,
          ...JSON.parse(localStorage.getItem(UI_KEY) || "{}"),
          ...LOCKED_LAYOUT
        };
      }catch{
        return defaults;
      }
    }
    
    function saveUIState(){
      localStorage.setItem(UI_KEY, JSON.stringify(UI));
    }
    
    function clone(obj){
      return JSON.parse(JSON.stringify(obj));
    }
    
    function parseLocalDate(s){
      if(!s) return null;
      const d = new Date(s + "T00:00:00");
      return isNaN(d) ? null : d;
    }
    
    function escapeHtml(str){
      return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }
    
    function getRowId(row){
      if (row.__baseId) return row.__baseId;
      return [row.Date || "", row["A-B"] || "", row["Now Playing"] || "", row.DJ || ""].join("||");
    }
    
    function getDay(dateStr){
      const d = parseLocalDate(dateStr);
      return d ? String(d.getDate()).padStart(2, "0") : "";
    }
    
    function formatMonthYear(date){
      return date.toLocaleDateString("en-GB", { month:"long", year:"numeric" }).toUpperCase();
    }
    
    function clearStaleDefaultMonthLabel(){
      const override = UI.monthLabelOverride?.trim().toUpperCase();
      if (override === "APRIL 2026" && formatMonthYear(currentMonthDate) !== "APRIL 2026"){
        UI.monthLabelOverride = "";
        saveUIState();
      }
    }
    
    function formatWeekLabel(start, end){
      const a = start.toLocaleDateString("en-GB", { day:"2-digit", month:"short" }).toUpperCase();
      const b = end.toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" }).toUpperCase();
      return `${a} — ${b}`;
    }
    
    function formatDayLabel(date){
      return date.toLocaleDateString("en-GB", { weekday:"long", day:"numeric", month:"long", year:"numeric" }).toUpperCase();
    }
    
    function to12hr(range){
      if(!range || !range.includes("-")) return "";
      const [a,b] = range.split("-").map(s => s.trim());
      const f = t => {
        let [h,m] = t.split(":").map(Number);
        if (Number.isNaN(h)) return t;
        const suffix = h >= 12 ? "PM" : "AM";
        h = h % 12 || 12;
        return m === 0 ? `${h}${suffix}` : `${h}:${String(m).padStart(2,"0")}${suffix}`;
      };
      return `${f(a)}–${f(b)}`;
    }
    
    function startDateTime(row){
      const start = row["A-B"]?.split("-")[0]?.trim() || "00:00";
      return new Date(`${row.Date}T${start}`);
    }
    
    function sortRows(rows){
      return rows.slice().sort((a,b) => startDateTime(a) - startDateTime(b));
    }
    
    function applyOverrides(baseRow){
      const id = getRowId(baseRow);
      const row = clone(baseRow);
      row.__baseId = id;
      if (OVERRIDES[id]) Object.assign(row, OVERRIDES[id]);
      return row;
    }
    
    function buildDjLine(row){
      const bits = [];
      if (row.DJ) bits.push(row.DJ);
      if (UI.showGuests){
        if (row["Guest DJ"]) bits.push(row["Guest DJ"]);
        if (row["Guest MC"]) bits.push(row["Guest MC"]);
      }
      return bits.join(" + ");
    }
    
    function isMobileLayout(){
      return window.matchMedia("(max-width: 1024px)").matches;
    }
    
    function setMobilePanelExpanded(expanded){
      const panel = document.querySelector(".panel");
      const btn = document.getElementById("mobilePanelToggle");
      if (!panel || !btn) return;
    
      panel.classList.toggle("expanded", expanded);
      btn.textContent = expanded ? "COLLAPSE" : "EXPAND";
      btn.setAttribute("aria-expanded", String(expanded));
    }
    
    function buildDayTitle(row){
      const djLine = buildDjLine(row);
      if (!djLine) return row["Now Playing"] || "";
      return row.useWith === false
        ? `${row["Now Playing"]} ${djLine}`
        : `${row["Now Playing"]} w/ ${djLine}`;
    }
    
    function getBaseRows(){
      return ALL_ROWS.map(applyOverrides).filter(r => !r.hidden);
    }
    
    function getRowsForMode(mode, refDate = null){
      const rows = getBaseRows();
    
      if (mode === "month"){
        const date = refDate || currentMonthDate;
        const month = date.getMonth();
        const year = date.getFullYear();
        return rows.filter(r => {
          const d = parseLocalDate(r.Date);
          return d && d.getMonth() === month && d.getFullYear() === year;
        });
      }
    
      if (mode === "week"){
        const date = refDate || currentWeekDate;
        const start = new Date(date);
        const day = start.getDay();
        const diff = (day + 6) % 7;
        start.setDate(start.getDate() - diff);
        start.setHours(0,0,0,0);
        const end = new Date(start);
        end.setDate(end.getDate() + 6);
        end.setHours(23,59,59,999);
    
        return rows.filter(r => {
          const d = parseLocalDate(r.Date);
          return d && d >= start && d <= end;
        });
      }
    
      if (mode === "day"){
        const date = refDate || currentDayDate;
        return rows.filter(r => {
          const d = parseLocalDate(r.Date);
          return d && d.toDateString() === date.toDateString();
        });
      }
    
      if (mode === "tonight"){
        const now = new Date();
        return sortRows(rows).filter(r => startDateTime(r) >= now).slice(0, 1);
      }
    
      if (mode === "lineup"){
        const date = refDate || currentMonthDate;
        const month = date.getMonth();
        const year = date.getFullYear();
        return rows.filter(r => {
          const d = parseLocalDate(r.Date);
          return d && d.getMonth() === month && d.getFullYear() === year;
        });
      }
    
      return rows;
    }
    
    function getLabelForMode(mode, refDate = null){
      if (mode === "month") return UI.monthLabelOverride?.trim() || formatMonthYear(refDate || currentMonthDate);
    
      if (mode === "week"){
        const date = refDate || currentWeekDate;
        const start = new Date(date);
        const day = start.getDay();
        const diff = (day + 6) % 7;
        start.setDate(start.getDate() - diff);
        start.setHours(0,0,0,0);
        const end = new Date(start);
        end.setDate(end.getDate() + 6);
        return formatWeekLabel(start, end);
      }
    
      if (mode === "day") return formatDayLabel(refDate || currentDayDate);
      if (mode === "tonight") return "TONIGHT";
      if (mode === "lineup") return `${formatMonthYear(refDate || currentMonthDate)} LINEUP`;
      return "";
    }
    
    function maybeAnimate(el, i, step){
      if (!UI.animate){
        el.style.animation = "none";
        el.style.opacity = "1";
        el.style.transform = "none";
      } else {
        el.style.animationDelay = `${i * step}s`;
      }
    }
    
    function selectRow(row){
      SELECTED_ID = row.__baseId || getRowId(row);
      populateEditor(row);
      const panel = document.querySelector(".panel");
      if (isMobileLayout()) setMobilePanelExpanded(true);
      panel.scrollTo({ top: panel.scrollHeight * 0.55, behavior: "smooth" });
    }
    
    function createMeshCanvas(){
      const canvas = document.createElement("canvas");
      canvas.className = "mesh-bg";
      canvas.width = 1080;
      canvas.height = 1920;
    
      const ctx = canvas.getContext("2d");
      let t = 0;
    
      function draw(){
        const w = canvas.width, h = canvas.height;
        ctx.clearRect(0,0,w,h);
    
        const bg = ctx.createLinearGradient(0,0,w,h);
        bg.addColorStop(0, UI.color4);
        bg.addColorStop(1, "#000000");
        ctx.fillStyle = bg;
        ctx.fillRect(0,0,w,h);
    
        const x1 = w * (0.25 + Math.sin(t * 0.9) * 0.12);
        const y1 = h * (0.22 + Math.cos(t * 1.1) * 0.08);
        const x2 = w * (0.76 + Math.cos(t * 1.2) * 0.10);
        const y2 = h * (0.36 + Math.sin(t * 1.0) * 0.10);
        const x3 = w * (0.48 + Math.sin(t * 0.7) * 0.14);
        const y3 = h * (0.82 + Math.cos(t * 1.3) * 0.08);
    
        const g1 = ctx.createRadialGradient(x1,y1,20,x1,y1,420);
        g1.addColorStop(0, UI.color1);
        g1.addColorStop(1, "transparent");
    
        const g2 = ctx.createRadialGradient(x2,y2,20,x2,y2,460);
        g2.addColorStop(0, UI.color2);
        g2.addColorStop(1, "transparent");
    
        const g3 = ctx.createRadialGradient(x3,y3,30,x3,y3,520);
        g3.addColorStop(0, UI.color3);
        g3.addColorStop(1, "transparent");
    
        ctx.save();
        ctx.filter = UI.blur ? "blur(95px)" : "blur(50px)";
        ctx.fillStyle = g1; ctx.fillRect(0,0,w,h);
        ctx.fillStyle = g2; ctx.fillRect(0,0,w,h);
        ctx.fillStyle = g3; ctx.fillRect(0,0,w,h);
        ctx.restore();
    
        t += UI.meshSpeed / 1200;
      }
    
      canvas.__drawFrame = draw;
      draw();
      return canvas;
    }
    
    function createShowRow(row, i){
      const d = document.createElement("div");
      d.className = "show";
      maybeAnimate(d, i, 0.03);
    
      d.innerHTML = `
        <div class="day">${escapeHtml(getDay(row.Date))}</div>
        <div class="title">${escapeHtml(row["Now Playing"] || "")}</div>
        <div class="time">${UI.showTime ? escapeHtml(to12hr(row["A-B"])) : ""}</div>
      `;
    
      d.addEventListener("click", () => selectRow(row));
      return d;
    }
    
    function getContentPadding(mode){
      const extra = mode === "day" || mode === "tonight"
        ? (UI.extraDayPadding ? 22 : 0)
        : 0;
    
      const safeTopWithBuffer = UI.safeTop + UI.innerBuffer + extra;
      const safeBottomWithBuffer = UI.safeBottom + UI.innerBuffer + (UI.extraDayPadding && (mode === "day" || mode === "tonight") ? 18 : 0);
      const safeSidesWithBuffer = UI.safeSides + UI.innerBuffer;
    
      return {
        top: Math.max(UI.padTop, safeTopWithBuffer),
        bottom: Math.max(UI.padBottom, safeBottomWithBuffer),
        sides: Math.max(UI.padSides, safeSidesWithBuffer)
      };
    }
    
    function applyModeScale(node, mode){
      let scale = 1;
      if (mode === "month") scale = UI.monthScale / 100;
      if (mode === "week") scale = UI.weekScale / 100;
      if (mode === "lineup") scale = UI.lineupScale / 100;
      if (mode === "day" || mode === "tonight") scale = UI.dayScale / 100;
    
      if (scale !== 1){
        node.style.transform = `scale(${scale})`;
        node.style.transformOrigin = "top left";
        node.style.width = `${100 / scale}%`;
      }
    
      return scale;
    }
    
    function autoFitBox(container, availableWidth, availableHeight, preferredScale = 1){
      if (!UI.autoFit) return;
    
      requestAnimationFrame(() => {
        container.style.transform = `scale(${preferredScale})`;
        container.style.transformOrigin = "top left";
        container.style.width = `${100 / preferredScale}%`;
    
        requestAnimationFrame(() => {
          const measuredWidth = container.scrollWidth;
          const measuredHeight = container.scrollHeight;
    
          const scaleX = availableWidth / measuredWidth;
          const scaleY = availableHeight / measuredHeight;
          const fit = Math.min(scaleX, scaleY, 1);
    
          const finalScale = preferredScale * fit;
    
          container.style.transform = `scale(${finalScale})`;
          container.style.transformOrigin = "top left";
          container.style.width = `${100 / finalScale}%`;
        });
      });
    }
    
    function buildStoryNode({ mode = MODE, refDate = null, forExport = false, withVideo = false, transparentBackground = false, keepOverlay = false } = {}){
      const story = document.createElement("div");
      story.className = "story-canvas";
      const isTransparent = transparentBackground || UI.transparent;
      if (isTransparent) story.classList.add("transparent");
      if (withVideo) story.classList.add("with-video");
      if (keepOverlay) story.classList.add("keep-overlay");
      if (!UI.animate || forExport) story.classList.add("no-anim");
      story.style.background = isTransparent ? "transparent" : "#000";
    
      if (withVideo){
        const video = document.createElement("video");
        video.className = "story-video-bg";
        video.src = BACKGROUND_VIDEO_URL;
        video.autoplay = true;
        video.loop = true;
        video.muted = true;
        video.playsInline = true;
        video.preload = "auto";
        story.appendChild(video);
        story.__backgroundVideo = video;
      }
    
      let meshCanvas = null;
      if (UI.mesh){
        meshCanvas = createMeshCanvas();
        story.appendChild(meshCanvas);
      }
    
      if (UI.overlay && (!isTransparent || keepOverlay)){
        const overlay = document.createElement("div");
        overlay.className = "story-overlay";
        story.appendChild(overlay);
      }
    
      const contentPadding = getContentPadding(mode);
    
      const inner = document.createElement("div");
      inner.className = "story-inner";
      inner.style.paddingTop = contentPadding.top + "px";
      inner.style.paddingBottom = contentPadding.bottom + "px";
      inner.style.paddingLeft = contentPadding.sides + "px";
      inner.style.paddingRight = contentPadding.sides + "px";
    
      const label = document.createElement("div");
      label.className = "story-label";
      label.textContent = getLabelForMode(mode, refDate);
    
      const content = document.createElement("div");
      content.className = "story-content";
    
      const rows = sortRows(getRowsForMode(mode, refDate));
    
      if (mode === "month"){
        const grid = document.createElement("div");
        grid.className = "columns month";
    
        const col1 = document.createElement("div");
        col1.className = "col";
    
        const col2 = document.createElement("div");
        col2.className = "col";
    
        const mid = Math.ceil(rows.length / 2);
        rows.slice(0, mid).forEach((row, i) => col1.appendChild(createShowRow(row, i)));
        rows.slice(mid).forEach((row, i) => col2.appendChild(createShowRow(row, i + mid)));
    
        grid.appendChild(col1);
        grid.appendChild(col2);
        content.appendChild(grid);
    
        const baseScale = applyModeScale(grid, mode);
        autoFitBox(grid, 1080 - (contentPadding.sides * 2), 1920 - contentPadding.top - contentPadding.bottom - 120, baseScale);
      }
    
      if (mode === "week"){
        const grid = document.createElement("div");
        grid.className = "columns week";
    
        const needsTwoCols = rows.length > 10;
        if (needsTwoCols) grid.classList.add("two-col");
    
        const col1 = document.createElement("div");
        col1.className = "col";
    
        const col2 = document.createElement("div");
        col2.className = "col";
    
        if (needsTwoCols){
          const mid = Math.ceil(rows.length / 2);
          rows.slice(0, mid).forEach((row, i) => col1.appendChild(createShowRow(row, i)));
          rows.slice(mid).forEach((row, i) => col2.appendChild(createShowRow(row, i + mid)));
          grid.appendChild(col1);
          grid.appendChild(col2);
        } else {
          rows.forEach((row, i) => col1.appendChild(createShowRow(row, i)));
          grid.appendChild(col1);
        }
    
        content.appendChild(grid);
    
        const baseScale = applyModeScale(grid, mode);
        autoFitBox(grid, 1080 - (contentPadding.sides * 2), 1920 - contentPadding.top - contentPadding.bottom - 120, baseScale);
      }
    
      if (mode === "day" || mode === "tonight"){
        const wrap = document.createElement("div");
        wrap.className = "day-stack";
    
        if (!rows.length){
          const empty = document.createElement("div");
          empty.className = "day-card";
          empty.style.animation = "none";
          empty.style.opacity = "1";
          empty.style.transform = "none";
          empty.innerHTML = `
            <div class="day-kicker">NO SHOWS</div>
            <div class="day-title">Nothing scheduled.</div>
          `;
          wrap.appendChild(empty);
        } else {
          rows.forEach((row, i) => {
            const card = document.createElement("div");
            card.className = mode === "tonight" ? "tonight-card" : "day-card";
            if (row.featured) card.classList.add("featured");
            maybeAnimate(card, i, 0.12);
    
            const genres = UI.showGenre ? (row.Genre || "") : "";
            const time = UI.showTime ? to12hr(row["A-B"]) : "";
    
            card.innerHTML = `
              <div class="day-kicker">${escapeHtml(getDay(row.Date))}</div>
              <div class="day-title">${escapeHtml(buildDayTitle(row))}</div>
              ${genres ? `<div class="day-genre">${escapeHtml(genres)}</div>` : ``}
              ${time ? `<div class="day-time">${escapeHtml(time)}</div>` : ``}
            `;
    
            card.addEventListener("click", () => selectRow(row));
            wrap.appendChild(card);
          });
        }
    
        content.appendChild(wrap);
    
        const baseScale = applyModeScale(wrap, mode);
        autoFitBox(wrap, 1080 - (contentPadding.sides * 2), 1920 - contentPadding.top - contentPadding.bottom - 120, baseScale);
      }
    
      if (mode === "lineup"){
        const wrap = document.createElement("div");
        wrap.className = "lineup-stack";
    
        rows.forEach((row, i) => {
          const item = document.createElement("div");
          item.className = "lineup-item";
          maybeAnimate(item, i, 0.03);
    
          const sub = UI.showGuests && buildDjLine(row)
            ? `<div class="lineup-sub">${escapeHtml(buildDjLine(row))}</div>`
            : "";
    
          item.innerHTML = `<div>${escapeHtml(row["Now Playing"] || "")}</div>${sub}`;
          item.addEventListener("click", () => selectRow(row));
          wrap.appendChild(item);
        });
    
        content.appendChild(wrap);
    
        const baseScale = applyModeScale(wrap, mode);
        autoFitBox(wrap, 1080 - (contentPadding.sides * 2), 1920 - contentPadding.top - contentPadding.bottom - 120, baseScale);
      }
    
      inner.appendChild(label);
      inner.appendChild(content);
      story.appendChild(inner);
    
      if (UI.showSafeZone){
        const guide = document.createElement("div");
        guide.className = "safe-zone-guide";
        guide.style.top = UI.safeTop + "px";
        guide.style.bottom = UI.safeBottom + "px";
        guide.style.left = UI.safeSides + "px";
        guide.style.right = UI.safeSides + "px";
        story.appendChild(guide);
      }
    
      if (UI.showContentBox){
        const box = document.createElement("div");
        box.className = "content-box-guide";
        box.style.top = contentPadding.top + "px";
        box.style.bottom = contentPadding.bottom + "px";
        box.style.left = contentPadding.sides + "px";
        box.style.right = contentPadding.sides + "px";
        story.appendChild(box);
      }
    
      if (meshCanvas) story.__meshCanvas = meshCanvas;
      return story;
    }
    
    function updatePreview(){
      const viewport = document.getElementById("previewViewport");
      const frame = document.getElementById("previewFrame");
    
      viewport.style.opacity = "0";
      viewport.innerHTML = "";
      const storyNode = buildStoryNode({ withVideo: UI.videoPreview });
      viewport.appendChild(storyNode);
      if (storyNode.__backgroundVideo){
        storyNode.__backgroundVideo.play().catch(() => {});
      }
    
      requestAnimationFrame(() => {
        const frameWidth = frame.clientWidth;
        const scale = frameWidth / 1080;
        viewport.style.transform = `scale(${scale})`;
        viewport.style.width = "1080px";
        viewport.style.height = "1920px";
        requestAnimationFrame(() => {
          viewport.style.opacity = "1";
        });
      });
    }
    
    function render(){
      document.querySelectorAll("#modeSeg button").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.mode === MODE);
      });
      updatePreview();
    }
    
    function populateEditor(row){
      document.getElementById("selectedInfo").innerHTML = `<strong>${escapeHtml(row["Now Playing"] || "Untitled")}</strong><br>${escapeHtml(row.Date || "")} · ${escapeHtml(row["A-B"] || "")}`;
      document.getElementById("editTitle").value = row["Now Playing"] || "";
      document.getElementById("editDJ").value = row.DJ || "";
      document.getElementById("editGuestDJ").value = row["Guest DJ"] || "";
      document.getElementById("editGuestMC").value = row["Guest MC"] || "";
      document.getElementById("editGenre").value = row.Genre || "";
      document.getElementById("editDate").value = row.Date || "";
      document.getElementById("editTime").value = row["A-B"] || "";
      document.getElementById("editUseWith").checked = row.useWith !== false;
      document.getElementById("editFeatured").checked = !!row.featured;
      document.getElementById("editHidden").checked = !!row.hidden;
    }
    
    function saveCurrentEdit(){
      if (!SELECTED_ID){
        alert("Click a row or card in the preview first.");
        return;
      }
    
      OVERRIDES[SELECTED_ID] = {
        "Now Playing": document.getElementById("editTitle").value.trim(),
        DJ: document.getElementById("editDJ").value.trim(),
        "Guest DJ": document.getElementById("editGuestDJ").value.trim(),
        "Guest MC": document.getElementById("editGuestMC").value.trim(),
        Genre: document.getElementById("editGenre").value.trim(),
        Date: document.getElementById("editDate").value.trim(),
        "A-B": document.getElementById("editTime").value.trim(),
        useWith: document.getElementById("editUseWith").checked,
        featured: document.getElementById("editFeatured").checked,
        hidden: document.getElementById("editHidden").checked
      };
    
      saveOverrides();
      render();
    }
    
    function clearCurrentEdit(){
      if (!SELECTED_ID){
        alert("No selected item.");
        return;
      }
    
      delete OVERRIDES[SELECTED_ID];
      saveOverrides();
    
      const base = ALL_ROWS.find(r => getRowId(r) === SELECTED_ID);
      if (base) populateEditor(applyOverrides(base));
      else document.getElementById("selectedInfo").textContent = "Click a row or card in the preview to edit it.";
    
      render();
    }
    
    function resetAllOverrides(){
      if (!confirm("Reset all local overrides?")) return;
      OVERRIDES = {};
      saveOverrides();
      SELECTED_ID = null;
      document.getElementById("selectedInfo").textContent = "Click a row or card in the preview to edit it.";
      render();
    }
    
    function syncControlsToUI(){
      document.getElementById("transparentToggle").checked = UI.transparent;
      document.getElementById("videoPreviewToggle").checked = UI.videoPreview;
      document.getElementById("animateToggle").checked = UI.animate;
    
      document.getElementById("meshToggle").checked = UI.mesh;
      document.getElementById("blurToggle").checked = UI.blur;
      document.getElementById("overlayToggle").checked = UI.overlay;
    
      document.getElementById("color1").value = UI.color1;
      document.getElementById("color2").value = UI.color2;
      document.getElementById("color3").value = UI.color3;
      document.getElementById("color4").value = UI.color4;
    
      document.getElementById("meshSpeedRange").value = UI.meshSpeed;
      document.getElementById("meshSpeedValue").textContent = String(UI.meshSpeed);
    }
    
    function setMode(mode){
      MODE = mode;
      render();
    }
    
    function shiftPeriod(dir){
      if (MODE === "month" || MODE === "lineup"){
        currentMonthDate = new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth() + dir, 1);
      } else if (MODE === "week") {
        currentWeekDate = new Date(currentWeekDate);
        currentWeekDate.setDate(currentWeekDate.getDate() + (7 * dir));
      } else if (MODE === "day") {
        currentDayDate = new Date(currentDayDate);
        currentDayDate.setDate(currentDayDate.getDate() + dir);
      }
      render();
    }
    
    function resetToday(){
      const now = new Date();
      currentMonthDate = new Date(now.getFullYear(), now.getMonth(), 1);
      currentWeekDate = new Date(now);
      currentDayDate = new Date(now);
      render();
    }
    
    function toggleLoop(){
      const btn = document.getElementById("loopBtn");
    
      if (LOOPING){
        LOOPING = false;
        clearInterval(loopTimer);
        loopTimer = null;
        btn.textContent = "START LOOP";
        return;
      }
    
      LOOPING = true;
      btn.textContent = "STOP LOOP";
    
      const sequence = [
        () => setMode("month"),
        () => setMode("week"),
        () => setMode("day"),
        () => shiftPeriod(1),
        () => setMode("tonight"),
        () => setMode("lineup")
      ];
    
      let step = 0;
      sequence[step]();
    
      loopTimer = setInterval(() => {
        step = (step + 1) % sequence.length;
        sequence[step]();
      }, 4500);
    }
    
    async function captureStoryNode(storyNode, forceTransparent = false){
      const stage = document.getElementById("exportStage");
      stage.innerHTML = "";
    
      if (forceTransparent) storyNode.style.background = "transparent";
      stage.appendChild(storyNode);
    
      if (storyNode.__meshCanvas && storyNode.__meshCanvas.__drawFrame){
        storyNode.__meshCanvas.__drawFrame();
      }
    
      if (document.fonts && document.fonts.ready){
        try { await document.fonts.ready; } catch {}
      }
    
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    
      return await html2canvas(storyNode, {
        backgroundColor: forceTransparent || UI.transparent ? null : "#000",
        scale: 1,
        width: 1080,
        height: 1920,
        useCORS: true
      });
    }
    
    function slugify(s){
      return String(s || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80);
    }
    
    async function exportCurrentPNG(forceTransparent = false){
      const storyNode = buildStoryNode({ mode: MODE, forExport: true });
      const canvas = await captureStoryNode(storyNode, forceTransparent);
    
      const link = document.createElement("a");
      const suffix = forceTransparent ? "alpha" : "png";
      link.download = `mesh-${MODE}-${slugify(getLabelForMode(MODE))}-${suffix}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    }
    
    function getWeekStartsForMonth(date){
      const rows = sortRows(getRowsForMode("month", date));
      const seen = new Set();
      const starts = [];
    
      rows.forEach(r => {
        const d = parseLocalDate(r.Date);
        const start = new Date(d);
        const day = start.getDay();
        const diff = (day + 6) % 7;
        start.setDate(start.getDate() - diff);
        start.setHours(0,0,0,0);
        const key = start.toISOString().slice(0,10);
        if (!seen.has(key)){
          seen.add(key);
          starts.push(start);
        }
      });
    
      return starts.sort((a,b) => a - b);
    }
    
    function getDaysForMonth(date){
      const rows = sortRows(getRowsForMode("month", date));
      const seen = new Set();
      const days = [];
    
      rows.forEach(r => {
        if (!seen.has(r.Date)){
          seen.add(r.Date);
          days.push(parseLocalDate(r.Date));
        }
      });
    
      return days.sort((a,b) => a - b);
    }
    
    async function exportPackZIP(){
      const zip = new JSZip();
      const monthDate = new Date(currentMonthDate);
    
      let node = buildStoryNode({ mode:"month", refDate:monthDate, forExport:true });
      let canvas = await captureStoryNode(node, false);
      zip.file(`01-month-${slugify(getLabelForMode("month", monthDate))}.png`, canvas.toDataURL("image/png").split(",")[1], {base64:true});
    
      const weekStarts = getWeekStartsForMonth(monthDate);
      for (let i = 0; i < weekStarts.length; i++){
        node = buildStoryNode({ mode:"week", refDate:weekStarts[i], forExport:true });
        canvas = await captureStoryNode(node, false);
        zip.file(`02-week-${String(i+1).padStart(2,"0")}-${slugify(getLabelForMode("week", weekStarts[i]))}.png`, canvas.toDataURL("image/png").split(",")[1], {base64:true});
      }
    
      const days = getDaysForMonth(monthDate);
      for (let i = 0; i < days.length; i++){
        node = buildStoryNode({ mode:"day", refDate:days[i], forExport:true });
        canvas = await captureStoryNode(node, false);
        zip.file(`03-day-${String(i+1).padStart(2,"0")}-${slugify(getLabelForMode("day", days[i]))}.png`, canvas.toDataURL("image/png").split(",")[1], {base64:true});
      }
    
      node = buildStoryNode({ mode:"lineup", refDate:monthDate, forExport:true });
      canvas = await captureStoryNode(node, false);
      zip.file(`04-lineup-${slugify(getLabelForMode("lineup", monthDate))}.png`, canvas.toDataURL("image/png").split(",")[1], {base64:true});
    
      node = buildStoryNode({ mode:"tonight", forExport:true });
      canvas = await captureStoryNode(node, false);
      zip.file(`05-tonight.png`, canvas.toDataURL("image/png").split(",")[1], {base64:true});
    
      const blob = await zip.generateAsync({ type:"blob" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `mesh-content-pack-${slugify(getLabelForMode("month", monthDate))}.zip`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 2000);
    }
    
    function loadBackgroundVideo(){
      return new Promise((resolve, reject) => {
        const video = document.createElement("video");
        video.src = BACKGROUND_VIDEO_URL;
        video.crossOrigin = "anonymous";
        video.playsInline = true;
        video.preload = "auto";
    
        video.addEventListener("loadedmetadata", () => resolve(video), { once:true });
        video.addEventListener("error", () => reject(new Error("Background video could not be loaded.")), { once:true });
        video.load();
      });
    }
    
    function drawCoverVideo(ctx, video, width, height){
      const videoRatio = video.videoWidth / video.videoHeight;
      const canvasRatio = width / height;
      let drawWidth = width;
      let drawHeight = height;
      let x = 0;
      let y = 0;
    
      if (videoRatio > canvasRatio){
        drawHeight = height;
        drawWidth = height * videoRatio;
        x = (width - drawWidth) / 2;
      } else {
        drawWidth = width;
        drawHeight = width / videoRatio;
        y = (height - drawHeight) / 2;
      }
    
      ctx.drawImage(video, x, y, drawWidth, drawHeight);
    }
    
    async function captureTransparentOverlay(){
      const node = buildStoryNode({
        mode: MODE,
        forExport: true,
        transparentBackground: true,
        keepOverlay: true
      });
      return await captureStoryNode(node, true);
    }
    
    async function exportVideo(){
      const canvas = document.createElement("canvas");
      canvas.width = 1080;
      canvas.height = 1920;
      const ctx = canvas.getContext("2d");
      const video = await loadBackgroundVideo();
      const overlayCanvas = await captureTransparentOverlay();
      video.currentTime = 0;
      await video.play();
    
      const stream = canvas.captureStream(30);
      if (video.captureStream){
        const videoStream = video.captureStream();
        videoStream.getAudioTracks().forEach(track => stream.addTrack(track));
      }
      const mimeTypes = ["video/webm;codecs=vp9","video/webm;codecs=vp8","video/webm"];
      const chosen = mimeTypes.find(t => MediaRecorder.isTypeSupported(t)) || "video/webm";
    
      const recorder = new MediaRecorder(stream, { mimeType: chosen });
      const chunks = [];
    
      recorder.ondataavailable = e => {
        if (e.data.size) chunks.push(e.data);
      };
    
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: chosen });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `mesh-${MODE}-over-video.webm`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      };
    
      recorder.start();
    
      while (!video.ended){
        ctx.clearRect(0,0,1080,1920);
        drawCoverVideo(ctx, video, 1080, 1920);
        ctx.drawImage(overlayCanvas, 0, 0);
        await new Promise(r => requestAnimationFrame(r));
      }
    
      recorder.stop();
    }
    
    function bindUICheckbox(id, key){
      document.getElementById(id).addEventListener("change", e => {
        UI[key] = e.target.checked;
        saveUIState();
        render();
      });
    }
    
    function bindRangeNumber(id, valueId, key, suffix = ""){
      document.getElementById(id).addEventListener("input", e => {
        UI[key] = Number(e.target.value);
        document.getElementById(valueId).textContent = `${UI[key]}${suffix}`;
        saveUIState();
        render();
      });
    }
    
    document.getElementById("modeSeg").addEventListener("click", e => {
      const btn = e.target.closest("button[data-mode]");
      if (!btn) return;
      setMode(btn.dataset.mode);
    });
    
    document.getElementById("prevBtn").addEventListener("click", () => shiftPeriod(-1));
    document.getElementById("todayBtn").addEventListener("click", resetToday);
    document.getElementById("nextBtn").addEventListener("click", () => shiftPeriod(1));
    document.getElementById("loopBtn").addEventListener("click", toggleLoop);
    document.getElementById("mobilePanelToggle").addEventListener("click", () => {
      const panel = document.querySelector(".panel");
      setMobilePanelExpanded(!panel.classList.contains("expanded"));
    });
    
    document.getElementById("pngBtn").addEventListener("click", async () => {
      try{
        await exportCurrentPNG(false);
      } catch(err){
        console.error(err);
        alert("PNG export failed. Check console for details.");
      }
    });
    
    document.getElementById("transparentPngBtn").addEventListener("click", async () => {
      try{
        await exportCurrentPNG(true);
      } catch(err){
        console.error(err);
        alert("Transparent PNG export failed. Check console for details.");
      }
    });
    
    document.getElementById("packBtn").addEventListener("click", async () => {
      const btn = document.getElementById("packBtn");
      const prev = btn.textContent;
      try{
        btn.textContent = "BUILDING ZIP...";
        btn.disabled = true;
        await exportPackZIP();
      } catch(err){
        console.error(err);
        alert("Pack export failed. Check console for details.");
      } finally{
        btn.textContent = prev;
        btn.disabled = false;
      }
    });
    
    document.getElementById("videoBtn").addEventListener("click", async () => {
      const btn = document.getElementById("videoBtn");
      const prev = btn.textContent;
      try{
        btn.textContent = "RENDERING...";
        btn.disabled = true;
        await exportVideo();
      } catch(err){
        console.error(err);
        alert("Video export failed. Your browser may not support MediaRecorder WEBM export.");
      } finally{
        btn.textContent = prev;
        btn.disabled = false;
      }
    });
    
    document.getElementById("saveEditBtn").addEventListener("click", saveCurrentEdit);
    document.getElementById("clearEditBtn").addEventListener("click", clearCurrentEdit);
    document.getElementById("resetOverridesBtn").addEventListener("click", resetAllOverrides);
    
    bindUICheckbox("transparentToggle", "transparent");
    bindUICheckbox("videoPreviewToggle", "videoPreview");
    bindUICheckbox("animateToggle", "animate");
    bindUICheckbox("meshToggle", "mesh");
    bindUICheckbox("blurToggle", "blur");
    bindUICheckbox("overlayToggle", "overlay");
    
    bindRangeNumber("meshSpeedRange", "meshSpeedValue", "meshSpeed", "");
    
    ["color1","color2","color3","color4"].forEach(id => {
      document.getElementById(id).addEventListener("input", e => {
        UI[id] = e.target.value;
        saveUIState();
        render();
      });
    });
    
    window.addEventListener("resize", updatePreview);
    
    Papa.parse(CSV_URL, {
      download:true,
      header:true,
      complete(res){
        ALL_ROWS = (res.data || [])
          .filter(r => r.Date && r["Now Playing"])
          .map(r => {
            const row = clone(r);
            row.__baseId = getRowId(r);
            return row;
          })
          .sort((a,b) => parseLocalDate(a.Date) - parseLocalDate(b.Date));
    
        syncControlsToUI();
        resetToday();
        clearStaleDefaultMonthLabel();
        syncControlsToUI();
        setMode("month");
      }
    });

    return () => {
      root.dataset.initialized = 'false';
      try { window.removeEventListener('resize', updatePreview); } catch {}
      try { clearInterval(loopTimer); } catch {}
    };
  }, []);

  return <main className="schedule-app" ref={rootRef} dangerouslySetInnerHTML={{ __html: CONTROL_MARKUP }} />;
}

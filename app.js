(() => {
  "use strict";

  const STORAGE_KEY = "knijnaya-popka-data-v1";

  const PALETTE = [
    "#8b2f2f", "#2f4d3a", "#1f3a5f", "#5b3a29",
    "#6b2d5c", "#3f5133", "#7a4b1e", "#1e3d3d",
    "#4a2c4a", "#8a6d1e", "#2d2d6b", "#6b1f2a"
  ];

  // ---------- state ----------
  let state = loadState();
  let pendingShelfIdForNewBook = null;
  let pendingConfirmAction = null;

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore corrupt data */ }
    return {
      shelves: [
        { id: uid(), name: "Моя полка", books: [] }
      ]
    };
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function uid() {
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  // deterministic pseudo-random from a string, for consistent per-book styling
  function hashNum(str, min, max) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
    return min + (h % (max - min + 1));
  }

  // ---------- DOM refs ----------
  const room = document.getElementById("room");
  const addShelfBtn = document.getElementById("addShelfBtn");

  const addBookModal = document.getElementById("addBookModal");
  const bookTitleInput = document.getElementById("bookTitleInput");
  const colorSwatches = document.getElementById("colorSwatches");
  const cancelAddBook = document.getElementById("cancelAddBook");
  const confirmAddBook = document.getElementById("confirmAddBook");

  const editBookModal = document.getElementById("editBookModal");
  const editTitleInput = document.getElementById("editTitleInput");
  const editColorSwatches = document.getElementById("editColorSwatches");
  const cancelEditBook = document.getElementById("cancelEditBook");
  const confirmEditBook = document.getElementById("confirmEditBook");
  const editBookBtn = document.getElementById("editBookBtn");

  const confirmModal = document.getElementById("confirmModal");
  const confirmText = document.getElementById("confirmText");
  const confirmYes = document.getElementById("confirmYes");
  const confirmNo = document.getElementById("confirmNo");

  const reader = document.getElementById("reader");
  const closeReader = document.getElementById("closeReader");
  const modeToggleBtn = document.getElementById("modeToggleBtn");
  const lockFlipBtn = document.getElementById("lockFlipBtn");
  const bookSpineSide = document.getElementById("bookSpineSide");
  const pageArea = document.getElementById("pageArea");
  const pageStatic = document.getElementById("pageStatic");
  const pageEditable = document.getElementById("pageEditable");
  const printedPageNum = document.getElementById("printedPageNum");
  const flipLayer = document.getElementById("flipLayer");
  const cornerNext = document.getElementById("cornerNext");
  const cornerPrev = document.getElementById("cornerPrev");

  let selectedColor = PALETTE[0];
  let editSelectedColor = PALETTE[0];
  let currentBookId = null;
  let currentShelfId = null;
  let currentPage = 0;
  let isFlipping = false;
  let dragState = null;
  let flipLocked = false;

  // ---------- rendering ----------
  function render() {
    room.innerHTML = "";
    state.shelves.forEach(shelf => room.appendChild(renderShelf(shelf)));
    saveState();
  }

  function renderShelf(shelf) {
    const unit = document.createElement("div");
    unit.className = "shelf-unit";

    const header = document.createElement("div");
    header.className = "shelf-header";

    const nameInput = document.createElement("input");
    nameInput.className = "shelf-name";
    nameInput.value = shelf.name;
    nameInput.maxLength = 30;
    nameInput.addEventListener("change", () => {
      shelf.name = nameInput.value.trim() || "Полка";
      saveState();
    });
    header.appendChild(nameInput);

    const delShelfBtn = document.createElement("button");
    delShelfBtn.className = "shelf-icon-btn";
    delShelfBtn.title = "Удалить полку";
    delShelfBtn.textContent = "🗑";
    delShelfBtn.addEventListener("click", () => {
      askConfirm(`Удалить полку «${shelf.name}» вместе со всеми книгами?`, () => {
        state.shelves = state.shelves.filter(s => s.id !== shelf.id);
        render();
      });
    });
    header.appendChild(delShelfBtn);

    unit.appendChild(header);

    const wrap = document.createElement("div");
    wrap.className = "shelf-board-wrap";

    const kase = document.createElement("div");
    kase.className = "shelf-case";

    const board = document.createElement("div");
    board.className = "shelf-board";
    kase.appendChild(board);

    const booksRow = document.createElement("div");
    booksRow.className = "books-row";

    shelf.books.forEach(book => booksRow.appendChild(renderBook(shelf, book)));

    const addSlot = document.createElement("div");
    addSlot.className = "add-book-slot";
    addSlot.textContent = "+";
    addSlot.title = "Добавить книгу";
    addSlot.addEventListener("click", () => openAddBookModal(shelf.id));
    booksRow.appendChild(addSlot);

    kase.appendChild(booksRow);
    wrap.appendChild(kase);
    unit.appendChild(wrap);

    return unit;
  }

  function renderBook(shelf, book) {
    const el = document.createElement("div");
    el.className = "book";

    const pages = Math.max(1, book.pages.length);
    const width = Math.min(70, 34 + pages * 2.2);
    const height = 120 + hashNum(book.id, 0, 34);
    const tilt = hashNum(book.id + "t", -20, 20) / 10; // -2.0 .. 2.0 deg

    el.style.width = width + "px";
    el.style.height = height + "px";
    el.style.background = `linear-gradient(100deg, ${shadeColor(book.color, 18)} 0%, ${book.color} 12%, ${book.color} 88%, ${shadeColor(book.color, -18)} 100%)`;
    el.style.transform = `rotate(${tilt}deg)`;

    const titleEl = document.createElement("div");
    titleEl.className = "book-title-vert";
    titleEl.textContent = book.title;
    el.appendChild(titleEl);

    const removeBtn = document.createElement("div");
    removeBtn.className = "book-remove";
    removeBtn.textContent = "×";
    removeBtn.title = "Убрать книгу с полки";
    removeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      askConfirm(`Убрать книгу «${book.title}» с полки?`, () => {
        shelf.books = shelf.books.filter(b => b.id !== book.id);
        render();
      });
    });
    el.appendChild(removeBtn);

    el.addEventListener("click", () => openReader(shelf.id, book.id));

    return el;
  }

  function shadeColor(hex, percent) {
    const num = parseInt(hex.replace("#", ""), 16);
    let r = (num >> 16) + Math.round(255 * (percent / 100));
    let g = ((num >> 8) & 0x00ff) + Math.round(255 * (percent / 100));
    let b = (num & 0x0000ff) + Math.round(255 * (percent / 100));
    r = Math.max(0, Math.min(255, r));
    g = Math.max(0, Math.min(255, g));
    b = Math.max(0, Math.min(255, b));
    return `rgb(${r}, ${g}, ${b})`;
  }

  // ---------- add shelf ----------
  addShelfBtn.addEventListener("click", () => {
    state.shelves.push({ id: uid(), name: `Полка ${state.shelves.length + 1}`, books: [] });
    render();
  });

  // ---------- custom HSL color picker (in-page, no native dialog) ----------
  function hslToHex(h, s, l) {
    s /= 100; l /= 100;
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const toHex = v => Math.round(v * 255).toString(16).padStart(2, "0");
    return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
  }

  function hexToHsl(hex) {
    const num = parseInt(hex.replace("#", ""), 16);
    let r = (num >> 16 & 255) / 255, g = (num >> 8 & 255) / 255, b = (num & 255) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    if (max === min) { h = s = 0; }
    else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        default: h = (r - g) / d + 4;
      }
      h *= 60;
    }
    return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
  }

  function buildSwatchesInto(container, onPick) {
    container.innerHTML = "";
    PALETTE.forEach((color, i) => {
      const sw = document.createElement("div");
      sw.className = "swatch" + (i === 0 ? " selected" : "");
      sw.style.background = color;
      sw.addEventListener("click", () => {
        [...container.children].forEach(c => c.classList.remove("selected"));
        sw.classList.add("selected");
        onPick(color);
      });
      container.appendChild(sw);
    });
  }

  function createColorPicker({ hueEl, satEl, lightEl, previewEl, satFillEl, lightFillEl, swatchesEl, onChange }) {
    function update() {
      const h = Number(hueEl.value), s = Number(satEl.value), l = Number(lightEl.value);
      const hex = hslToHex(h, s, l);
      previewEl.style.background = hex;
      satFillEl.style.background = `linear-gradient(90deg, ${hslToHex(h, 0, l)}, ${hslToHex(h, 100, l)})`;
      lightFillEl.style.background = `linear-gradient(90deg, #000, ${hslToHex(h, s, 50)}, #fff)`;
      onChange(hex);
    }
    [hueEl, satEl, lightEl].forEach(el => {
      el.addEventListener("input", () => {
        if (swatchesEl) [...swatchesEl.children].forEach(c => c.classList.remove("selected"));
        update();
      });
    });
    function setFromHex(hex) {
      const { h, s, l } = hexToHsl(hex);
      hueEl.value = h;
      satEl.value = s;
      lightEl.value = l;
      update();
    }
    return { setFromHex };
  }

  const addPicker = createColorPicker({
    hueEl: document.getElementById("hueRange"),
    satEl: document.getElementById("satRange"),
    lightEl: document.getElementById("lightRange"),
    previewEl: document.getElementById("colorPreview"),
    satFillEl: document.getElementById("satFill"),
    lightFillEl: document.getElementById("lightFill"),
    swatchesEl: colorSwatches,
    onChange: hex => { selectedColor = hex; }
  });
  buildSwatchesInto(colorSwatches, color => {
    selectedColor = color;
    addPicker.setFromHex(color);
  });

  const editPicker = createColorPicker({
    hueEl: document.getElementById("editHueRange"),
    satEl: document.getElementById("editSatRange"),
    lightEl: document.getElementById("editLightRange"),
    previewEl: document.getElementById("editColorPreview"),
    satFillEl: document.getElementById("editSatFill"),
    lightFillEl: document.getElementById("editLightFill"),
    swatchesEl: editColorSwatches,
    onChange: hex => { editSelectedColor = hex; }
  });
  buildSwatchesInto(editColorSwatches, color => {
    editSelectedColor = color;
    editPicker.setFromHex(color);
  });

  // ---------- add book modal ----------
  function openAddBookModal(shelfId) {
    pendingShelfIdForNewBook = shelfId;
    bookTitleInput.value = "";
    selectedColor = PALETTE[0];
    [...colorSwatches.children].forEach((c, i) => c.classList.toggle("selected", i === 0));
    addPicker.setFromHex(PALETTE[0]);
    addBookModal.classList.remove("hidden");
    setTimeout(() => bookTitleInput.focus(), 50);
  }

  cancelAddBook.addEventListener("click", () => addBookModal.classList.add("hidden"));
  addBookModal.addEventListener("click", (e) => { if (e.target === addBookModal) addBookModal.classList.add("hidden"); });

  confirmAddBook.addEventListener("click", () => {
    const title = bookTitleInput.value.trim();
    if (!title) { bookTitleInput.focus(); return; }
    const shelf = state.shelves.find(s => s.id === pendingShelfIdForNewBook);
    if (!shelf) return;
    shelf.books.push({ id: uid(), title, color: selectedColor, pages: [""] });
    addBookModal.classList.add("hidden");
    render();
  });

  bookTitleInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") confirmAddBook.click();
  });

  // ---------- edit book modal ----------
  function openEditBookModal() {
    const book = getCurrentBook();
    if (!book) return;
    editTitleInput.value = book.title;
    editSelectedColor = book.color;
    const matchIndex = PALETTE.indexOf(book.color);
    [...editColorSwatches.children].forEach((c, i) => c.classList.toggle("selected", i === matchIndex));
    editPicker.setFromHex(book.color);
    editBookModal.classList.remove("hidden");
    setTimeout(() => editTitleInput.focus(), 50);
  }

  editBookBtn.addEventListener("click", openEditBookModal);
  cancelEditBook.addEventListener("click", () => editBookModal.classList.add("hidden"));
  editBookModal.addEventListener("click", (e) => { if (e.target === editBookModal) editBookModal.classList.add("hidden"); });

  confirmEditBook.addEventListener("click", () => {
    const book = getCurrentBook();
    if (!book) return;
    const title = editTitleInput.value.trim();
    if (!title) { editTitleInput.focus(); return; }
    book.title = title;
    book.color = editSelectedColor;
    saveState();
    bookSpineSide.style.setProperty("--spine-color", shadeColor(book.color, -10));
    editBookModal.classList.add("hidden");
  });

  editTitleInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") confirmEditBook.click();
  });

  // ---------- confirm modal ----------
  function askConfirm(text, onYes) {
    confirmText.textContent = text;
    pendingConfirmAction = onYes;
    confirmModal.classList.remove("hidden");
  }
  confirmYes.addEventListener("click", () => {
    confirmModal.classList.add("hidden");
    if (pendingConfirmAction) pendingConfirmAction();
    pendingConfirmAction = null;
  });
  confirmNo.addEventListener("click", () => {
    confirmModal.classList.add("hidden");
    pendingConfirmAction = null;
  });

  // ---------- sound: synthesized page-flip swish ----------
  let audioCtx = null;
  function getAudioCtx() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AC();
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }

  function playPageFlipSound() {
    try {
      const ctx = getAudioCtx();
      const duration = 0.38;
      const bufferSize = Math.floor(ctx.sampleRate * duration);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1);
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const bandpass = ctx.createBiquadFilter();
      bandpass.type = "bandpass";
      bandpass.frequency.setValueAtTime(1800, ctx.currentTime);
      bandpass.frequency.exponentialRampToValueAtTime(4200, ctx.currentTime + duration * 0.5);
      bandpass.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + duration);
      bandpass.Q.value = 0.7;

      const highpass = ctx.createBiquadFilter();
      highpass.type = "highpass";
      highpass.frequency.value = 700;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.5, ctx.currentTime + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + duration * 0.55);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

      noise.connect(bandpass);
      bandpass.connect(highpass);
      highpass.connect(gain);
      gain.connect(ctx.destination);

      noise.start();
      noise.stop(ctx.currentTime + duration);

      // a soft little "tap" at the very end, like the page settling
      const tapOsc = ctx.createOscillator();
      tapOsc.type = "triangle";
      tapOsc.frequency.value = 180;
      const tapGain = ctx.createGain();
      tapGain.gain.setValueAtTime(0.001, ctx.currentTime + duration * 0.85);
      tapGain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + duration * 0.9);
      tapGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration + 0.05);
      tapOsc.connect(tapGain);
      tapGain.connect(ctx.destination);
      tapOsc.start(ctx.currentTime + duration * 0.85);
      tapOsc.stop(ctx.currentTime + duration + 0.06);
    } catch (e) { /* audio not available, fail silently */ }
  }

  // ---------- reader ----------
  function getCurrentBook() {
    const shelf = state.shelves.find(s => s.id === currentShelfId);
    if (!shelf) return null;
    return shelf.books.find(b => b.id === currentBookId) || null;
  }

  // ---------- auto-pagination: overflowing text flows onto later pages ----------
  // A hidden clone of the page box, kept off-screen, used only to ask "would
  // this much text fit on one page" via the browser's own text layout —
  // matches the real page's font, padding and responsive size exactly because
  // it's built from the same CSS classes.
  const measureStage = document.createElement("div");
  measureStage.className = "book-stage";
  measureStage.style.cssText = "position:fixed; left:-9999px; top:0; visibility:hidden; pointer-events:none;";
  const measureBookEl = document.createElement("div");
  measureBookEl.style.cssText = "width:100%; height:100%; position:relative; display:block; padding:0;";
  const measurePageArea = document.createElement("div");
  measurePageArea.className = "page-area";
  measurePageArea.style.cssText = "position:relative; width:100%; height:100%;";
  const measurePageStatic = document.createElement("div");
  measurePageStatic.className = "page-static";
  const measureTextarea = document.createElement("textarea");
  measureTextarea.className = "page-editable";
  measureTextarea.tabIndex = -1;
  measureTextarea.setAttribute("aria-hidden", "true");
  measurePageStatic.appendChild(measureTextarea);
  measurePageArea.appendChild(measurePageStatic);
  measureBookEl.appendChild(measurePageArea);
  measureStage.appendChild(measureBookEl);
  document.body.appendChild(measureStage);

  function fitsOnPage(text) {
    measureTextarea.value = text;
    return measureTextarea.scrollHeight <= measureTextarea.clientHeight + 1;
  }

  // Largest prefix of `text` that fits on one page, broken at a word boundary
  // where possible, plus whatever is left over for the next page.
  function splitForPage(text) {
    if (fitsOnPage(text)) return { chunk: text, rest: "" };
    let lo = 0, hi = text.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (fitsOnPage(text.slice(0, mid))) lo = mid; else hi = mid - 1;
    }
    let splitAt = lo;
    if (splitAt < text.length) {
      let i = splitAt;
      while (i > 0 && !/\s/.test(text[i - 1])) i--;
      if (i > 0) splitAt = i;
    }
    if (splitAt <= 0) splitAt = 1; // always make progress, even on one giant unbroken word
    return { chunk: text.slice(0, splitAt), rest: text.slice(splitAt) };
  }

  // Re-flows the book's text from `fromIndex` onward across as many pages as
  // it takes: pulls trailing pages' text forward to fill gaps left by edits,
  // and pushes overflow from a page into the next (creating new pages as
  // needed), so a page never needs its own internal scrollbar to read it all.
  function paginateFromIndex(book, fromIndex) {
    const before = book.pages.slice(fromIndex);
    let remaining = before.join("");
    const after = [];
    while (remaining.length > 0) {
      const { chunk, rest } = splitForPage(remaining);
      after.push(chunk);
      remaining = rest;
    }
    if (after.length === 0) after.push("");
    const changed = before.length !== after.length || before.some((p, i) => p !== after[i]);
    if (changed) {
      book.pages = book.pages.slice(0, fromIndex).concat(after);
      saveState();
    }
    return changed;
  }

  let paginateTimer = null;
  function schedulePagination() {
    clearTimeout(paginateTimer);
    paginateTimer = setTimeout(() => {
      const book = getCurrentBook();
      if (!book) return;
      const changed = paginateFromIndex(book, currentPage);
      if (changed) {
        const newText = book.pages[currentPage] || "";
        if (pageEditable.value !== newText) {
          const atEnd = pageEditable.selectionStart === pageEditable.value.length;
          pageEditable.value = newText;
          if (atEnd) { const p = newText.length; pageEditable.setSelectionRange(p, p); }
        }
        printedPageNum.textContent = `— ${currentPage + 1} —`;
      }
    }, 180);
  }

  // ---------- flip lock + read/write mode ----------
  function setFlipLocked(locked) {
    flipLocked = locked;
    pageArea.classList.toggle("flip-locked", locked);
    lockFlipBtn.textContent = locked ? "🔒" : "🔓";
    lockFlipBtn.title = locked ? "Разблокировать перелистывание" : "Заблокировать перелистывание";
  }
  lockFlipBtn.addEventListener("click", () => setFlipLocked(!flipLocked));

  function setReadMode(readMode) {
    pageEditable.readOnly = readMode;
    modeToggleBtn.textContent = readMode ? "🖊" : "👁";
    modeToggleBtn.title = readMode ? "Режим письма" : "Режим чтения";
  }
  modeToggleBtn.addEventListener("click", () => setReadMode(!pageEditable.readOnly));

  function openReader(shelfId, bookId) {
    currentShelfId = shelfId;
    currentBookId = bookId;
    const book = getCurrentBook();
    if (!book) return;
    currentPage = 0;
    bookSpineSide.style.setProperty("--spine-color", shadeColor(book.color, -10));
    reader.classList.remove("hidden");
    setFlipLocked(false);
    setReadMode(false);
    paginateFromIndex(book, 0);
    renderPage();
  }

  function closeReaderFn() {
    saveCurrentPageText();
    clearTimeout(paginateTimer);
    reader.classList.add("hidden");
    render();
  }
  closeReader.addEventListener("click", closeReaderFn);

  function saveCurrentPageText() {
    const book = getCurrentBook();
    if (!book) return;
    book.pages[currentPage] = pageEditable.value;
    saveState();
  }

  pageEditable.addEventListener("input", () => {
    const book = getCurrentBook();
    if (!book) return;
    book.pages[currentPage] = pageEditable.value;
    schedulePagination();
  });

  function renderPage() {
    const book = getCurrentBook();
    if (!book) return;
    pageEditable.value = book.pages[currentPage] || "";
    printedPageNum.textContent = `— ${currentPage + 1} —`;
    pageEditable.style.opacity = "1";
  }

  function buildFlipFace(text, extraClass) {
    const face = document.createElement("div");
    face.className = "flip-face" + (extraClass ? " " + extraClass : "");
    face.textContent = text;
    return face;
  }

  // Remove a trailing blank page left behind by flipping forward and back
  // without writing anything on it, so empty pages don't pile up.
  function trimTrailingEmpty(leftIndex) {
    const book = getCurrentBook();
    if (!book) return;
    if (
      leftIndex === book.pages.length - 1 &&
      book.pages.length > 1 &&
      (book.pages[leftIndex] || "") === ""
    ) {
      book.pages.splice(leftIndex, 1);
      saveState();
    }
  }

  const FLIP_SETTLE_MS = 520;
  const MAX_CURL_SKEW = 9; // degrees — how much a middle-grab flip bends, like paper and not cardboard

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // ---- corner-peel geometry: folding a corner so point C lands on point P is,
  // in real paper, a reflection across the perpendicular bisector of segment C-P.
  // That gives us the fold line, and everything on C's side of it is the part
  // that visibly lifts and bends back.

  function computeFold(caseName, C, P, W, H) {
    const d = { x: P.x - C.x, y: P.y - C.y };
    const len = Math.hypot(d.x, d.y) || 1;
    const n = { x: d.x / len, y: d.y / len };
    const lineDir = { x: -n.y, y: n.x }; // perpendicular to C→P
    const M = { x: (C.x + P.x) / 2, y: (C.y + P.y) / 2 };

    let onH, onV; // intersections with the two page edges meeting at C
    if (Math.abs(lineDir.y) > 1e-6) {
      const t = (C.y - M.y) / lineDir.y;
      onH = { x: clamp(M.x + t * lineDir.x, 0, W), y: C.y };
    } else {
      onH = { x: clamp(M.x, 0, W), y: C.y };
    }
    if (Math.abs(lineDir.x) > 1e-6) {
      const t = (C.x - M.x) / lineDir.x;
      onV = { x: C.x, y: clamp(M.y + t * lineDir.y, 0, H) };
    } else {
      onV = { x: C.x, y: clamp(M.y, 0, H) };
    }

    // E1/E2 in the order the polygon below needs to trace the page boundary
    let E1, E2;
    if (caseName === "next-top") { E1 = onH; E2 = onV; }
    else if (caseName === "next-bottom") { E1 = onV; E2 = onH; }
    else if (caseName === "prev-top") { E1 = onV; E2 = onH; }
    else { E1 = onH; E2 = onV; } // prev-bottom

    const phi = Math.atan2(lineDir.y, lineDir.x) * 180 / Math.PI;
    return { M, phi, E1, E2 };
  }

  function pointsToPolygon(points) {
    return "polygon(" + points.map(p => `${p.x.toFixed(1)}px ${p.y.toFixed(1)}px`).join(", ") + ")";
  }

  // the full page rectangle with the C corner sliced off along E1-E2
  function staticPagePolygon(caseName, E1, E2, W, H) {
    const TL = { x: 0, y: 0 }, TR = { x: W, y: 0 }, BR = { x: W, y: H }, BL = { x: 0, y: H };
    let pts;
    if (caseName === "next-top") pts = [BL, TL, E1, E2, BR];
    else if (caseName === "next-bottom") pts = [TL, TR, E1, E2, BL];
    else if (caseName === "prev-top") pts = [BR, BL, E1, E2, TR];
    else pts = [TR, BR, E1, E2, TL]; // prev-bottom
    return pointsToPolygon(pts);
  }

  function reflectTransform(M, phiDeg) {
    return `translate(${M.x.toFixed(1)}px, ${M.y.toFixed(1)}px) rotate(${phiDeg.toFixed(2)}deg) `
      + `scaleY(-1) rotate(${(-phiDeg).toFixed(2)}deg) translate(${(-M.x).toFixed(1)}px, ${(-M.y).toFixed(1)}px)`;
  }

  function startDrag(direction, clientX, clientY) {
    const book = getCurrentBook();
    if (!book || isFlipping) return null;
    const targetPage = direction === "next" ? currentPage + 1 : currentPage - 1;
    if (direction === "prev" && targetPage < 0) return null;
    const isNew = direction === "next" && targetPage >= book.pages.length;

    saveCurrentPageText();
    isFlipping = true;

    const areaRect = pageArea.getBoundingClientRect();
    const W = Math.max(1, areaRect.width), H = Math.max(1, areaRect.height);
    const grabRatio = clientY == null ? 0.5 : clamp((clientY - areaRect.top) / H, 0, 1);

    const base = {
      direction, targetPage, isNew, areaRect, W, H,
      startClientX: clientX, startClientY: clientY,
      progress: 0, moved: false
    };

    // Grabbing near the top or bottom edge peels that corner, like lifting a real
    // page by its corner. Grabbing near the middle keeps the familiar straight flip.
    if (grabRatio < 0.35 || grabRatio > 0.65) {
      const corner = grabRatio < 0.5 ? "top" : "bottom";
      const caseName = `${direction}-${corner}`;
      const C = { x: direction === "next" ? W : 0, y: corner === "top" ? 0 : H };

      const flap = document.createElement("div");
      flap.className = "peel-flap";
      flap.style.clipPath = pointsToPolygon([C, C, C]);
      flipLayer.appendChild(flap);
      pageStatic.style.transition = "none";

      const initialP = {
        x: clamp((clientX ?? areaRect.left + C.x) - areaRect.left, 0, W),
        y: clamp((clientY ?? areaRect.top + C.y) - areaRect.top, 0, H)
      };
      return Object.assign(base, { mode: "peel", caseName, C, flap, lastP: initialP });
    }

    const currentText = book.pages[currentPage] || "";
    const targetText = isNew ? "" : (book.pages[targetPage] || "");
    const flipPage = document.createElement("div");
    flipPage.className = "flip-page";
    const shade = document.createElement("div");
    shade.className = "flip-shade";

    let front, back, startDeg, endDeg;
    if (direction === "next") {
      front = buildFlipFace(currentText);
      back = buildFlipFace(targetText, "back");
      startDeg = 0; endDeg = -180;
    } else {
      front = buildFlipFace(targetText);
      back = buildFlipFace(currentText, "back");
      startDeg = -180; endDeg = 0;
    }
    flipPage.appendChild(front);
    flipPage.appendChild(back);
    flipPage.appendChild(shade);
    flipPage.style.transform = `rotateY(${startDeg}deg)`;
    pageEditable.style.opacity = "0";
    flipLayer.appendChild(flipPage);
    void flipPage.offsetWidth;

    const skewSign = clamp((grabRatio - 0.5) * 2, -1, 1);
    shade.style.setProperty("--fold-angle", `${90 + skewSign * 18}deg`);

    return Object.assign(base, { mode: "flat", flipPage, shade, skewSign, startDeg, endDeg });
  }

  function curlTransform(deg, progress, skewSign) {
    const skewDeg = skewSign * MAX_CURL_SKEW * Math.sin(progress * Math.PI);
    return `rotateY(${deg}deg) skewY(${skewDeg}deg)`;
  }

  function updateDrag(clientX, clientY) {
    if (!dragState) return;
    if (Math.abs(clientX - dragState.startClientX) > 4 || Math.abs(clientY - dragState.startClientY) > 4) {
      dragState.moved = true;
    }

    if (dragState.mode === "peel") {
      const r = dragState.areaRect;
      let rawP = { x: clamp(clientX - r.left, 0, dragState.W), y: clamp(clientY - r.top, 0, dragState.H) };

      // Touch input occasionally delivers one wild sample (sensor glitch, palm
      // brush, browser touch-prediction) wildly far from the last real position.
      // A single such sample must not be allowed to snap the fold to a bogus
      // shape; smooth it out by capping how far a single frame can move it.
      if (dragState.lastP) {
        const jump = Math.hypot(rawP.x - dragState.lastP.x, rawP.y - dragState.lastP.y);
        const maxJump = Math.min(dragState.W, dragState.H) * 0.45;
        if (jump > maxJump) {
          const t = maxJump / jump;
          rawP = {
            x: dragState.lastP.x + (rawP.x - dragState.lastP.x) * t,
            y: dragState.lastP.y + (rawP.y - dragState.lastP.y) * t
          };
        }
      }
      dragState.lastP = rawP;

      const dx = Math.abs(rawP.x - dragState.C.x);
      dragState.progress = clamp(dx / (dragState.W * 0.85), 0, 1);

      const dist = Math.hypot(rawP.x - dragState.C.x, rawP.y - dragState.C.y);
      if (dist < 6) {
        dragState.flap.style.clipPath = pointsToPolygon([dragState.C, dragState.C, dragState.C]);
        pageStatic.style.clipPath = "none";
        return;
      }

      // Keep the fold at a plausible angle and a modest size, independent of the
      // (uncapped) commit progress above: a real dog-ear stays a corner curl that
      // follows your finger loosely, instead of swinging to a near-vertical pull
      // (which would carve a degenerate sliver out of the whole page) or growing
      // past the point where it'd still read as "a corner", however far you drag.
      const idealAngle = dragState.direction === "next" ? Math.PI : 0;
      let angle = Math.atan2(rawP.y - dragState.C.y, rawP.x - dragState.C.x);
      let diff = angle - idealAngle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const maxAngle = Math.PI / 3; // 60°
      diff = clamp(diff, -maxAngle, maxAngle);
      angle = idealAngle + diff;

      const maxRadius = Math.min(dragState.W, dragState.H) * 0.62;
      const radius = Math.min(dist, maxRadius);
      const P = {
        x: clamp(dragState.C.x + Math.cos(angle) * radius, 0, dragState.W),
        y: clamp(dragState.C.y + Math.sin(angle) * radius, 0, dragState.H)
      };

      const { M, phi, E1, E2 } = computeFold(dragState.caseName, dragState.C, P, dragState.W, dragState.H);

      // Last line of defense: whatever produced this frame's numbers, the fold
      // triangle has to stay a plausible corner curl. If either edge point ends
      // up further from the corner than the capped reach could ever justify,
      // something upstream went wrong for this one frame — leave the picture as
      // it was rather than flash a broken shape.
      const reach = radius * 2.5 + 4;
      const okE1 = Math.hypot(E1.x - dragState.C.x, E1.y - dragState.C.y) <= reach;
      const okE2 = Math.hypot(E2.x - dragState.C.x, E2.y - dragState.C.y) <= reach;
      if (!okE1 || !okE2 || !isFinite(phi)) return;

      dragState.flap.style.clipPath = pointsToPolygon([dragState.C, E1, E2]);
      dragState.flap.style.transform = reflectTransform(M, phi);
      pageStatic.style.clipPath = staticPagePolygon(dragState.caseName, E1, E2, dragState.W, dragState.H);
      return;
    }

    const dx = clientX - dragState.startClientX;
    const dir = dragState.direction === "next" ? -1 : 1;
    const progress = clamp((dx * dir) / (dragState.W * 0.85), 0, 1);
    dragState.progress = progress;
    const deg = dragState.startDeg + (dragState.endDeg - dragState.startDeg) * progress;
    dragState.flipPage.style.transform = curlTransform(deg, progress, dragState.skewSign);
    dragState.shade.style.opacity = String(Math.sin(progress * Math.PI) * 0.9);
  }

  // Hand a committed/cancelled corner peel off to the plain rotateY flip, picking
  // up roughly where the peel left off so the finishing motion stays continuous.
  function finishPeelToFlat(ds, book) {
    ds.flap.remove();
    pageStatic.style.transition = "";
    pageStatic.style.clipPath = "none";

    const currentText = book.pages[currentPage] || "";
    const targetText = ds.isNew ? "" : (book.pages[ds.targetPage] || "");
    const flipPage = document.createElement("div");
    flipPage.className = "flip-page";
    const shade = document.createElement("div");
    shade.className = "flip-shade";

    let front, back, startDeg, endDeg;
    if (ds.direction === "next") {
      front = buildFlipFace(currentText);
      back = buildFlipFace(targetText, "back");
      startDeg = 0; endDeg = -180;
    } else {
      front = buildFlipFace(targetText);
      back = buildFlipFace(currentText, "back");
      startDeg = -180; endDeg = 0;
    }
    flipPage.appendChild(front);
    flipPage.appendChild(back);
    flipPage.appendChild(shade);
    flipPage.style.transform = `rotateY(${startDeg}deg)`;
    pageEditable.style.opacity = "0";
    flipLayer.appendChild(flipPage);
    void flipPage.offsetWidth;

    flipPage.style.transition = `transform ${FLIP_SETTLE_MS}ms cubic-bezier(.4,.1,.2,1)`;
    shade.style.transition = `opacity ${FLIP_SETTLE_MS}ms ease`;
    requestAnimationFrame(() => {
      flipPage.style.transform = `rotateY(${endDeg}deg)`;
      shade.style.opacity = "1";
      setTimeout(() => { shade.style.opacity = "0"; }, FLIP_SETTLE_MS * 0.55);
    });
    playPageFlipSound();

    setTimeout(() => {
      flipPage.remove();
      if (ds.isNew && book) { book.pages.push(""); saveState(); }
      const leavingIndex = currentPage;
      currentPage = ds.targetPage;
      if (ds.direction === "prev") trimTrailingEmpty(leavingIndex);
      isFlipping = false;
      renderPage();
    }, FLIP_SETTLE_MS + 40);
  }

  function cancelPeel(ds) {
    const collapsedFlap = pointsToPolygon([ds.C, ds.C, ds.C]);
    const collapsedStatic = staticPagePolygon(ds.caseName, ds.C, ds.C, ds.W, ds.H);
    ds.flap.style.transition = `clip-path ${FLIP_SETTLE_MS}ms ease`;
    pageStatic.style.transition = `clip-path ${FLIP_SETTLE_MS}ms ease`;
    ds.flap.style.clipPath = collapsedFlap;
    pageStatic.style.clipPath = collapsedStatic;
    setTimeout(() => {
      ds.flap.remove();
      pageStatic.style.transition = "none";
      pageStatic.style.clipPath = "none";
      isFlipping = false;
    }, FLIP_SETTLE_MS + 20);
  }

  function endDrag() {
    if (!dragState) return;
    const ds = dragState;
    dragState = null;
    const book = getCurrentBook();
    const willCommit = ds.moved ? ds.progress > 0.32 : true; // a plain tap always completes the flip

    if (ds.mode === "peel") {
      if (willCommit) finishPeelToFlat(ds, book);
      else cancelPeel(ds);
      return;
    }

    const transition = `transform ${FLIP_SETTLE_MS}ms cubic-bezier(.4,.1,.2,1), opacity ${FLIP_SETTLE_MS}ms ease`;
    ds.flipPage.style.transition = transition;
    ds.shade.style.transition = `opacity ${FLIP_SETTLE_MS}ms ease`;

    if (willCommit) {
      ds.flipPage.style.transform = curlTransform(ds.endDeg, 1, ds.skewSign);
      ds.shade.style.opacity = "0";
      playPageFlipSound();
      setTimeout(() => {
        ds.flipPage.remove();
        if (ds.isNew && book) { book.pages.push(""); saveState(); }
        const leavingIndex = currentPage;
        currentPage = ds.targetPage;
        if (ds.direction === "prev") trimTrailingEmpty(leavingIndex);
        isFlipping = false;
        renderPage();
      }, FLIP_SETTLE_MS + 20);
    } else {
      ds.flipPage.style.transform = curlTransform(ds.startDeg, 0, ds.skewSign);
      ds.shade.style.opacity = "0";
      setTimeout(() => {
        ds.flipPage.remove();
        pageEditable.style.opacity = "1";
        isFlipping = false;
      }, FLIP_SETTLE_MS + 20);
    }
  }

  function attachCornerDrag(el, direction) {
    el.addEventListener("pointerdown", (e) => {
      if (isFlipping || flipLocked) return;
      e.preventDefault();
      const ds = startDrag(direction, e.clientX, e.clientY);
      if (!ds) return;
      dragState = ds;
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }

      const onMove = (ev) => {
        if (!dragState) return;
        updateDrag(ev.clientX, ev.clientY);
      };
      const onUp = () => {
        el.removeEventListener("pointermove", onMove);
        el.removeEventListener("pointerup", onUp);
        el.removeEventListener("pointercancel", onUp);
        endDrag();
      };
      el.addEventListener("pointermove", onMove);
      el.addEventListener("pointerup", onUp);
      el.addEventListener("pointercancel", onUp);
    });
  }

  attachCornerDrag(cornerNext, "next");
  attachCornerDrag(cornerPrev, "prev");

  function quickFlip(direction) {
    if (isFlipping || flipLocked) return;
    const ds = startDrag(direction, 0, null); // clientY omitted -> middle grab -> plain flip
    if (!ds) return;
    dragState = ds;
    dragState.moved = false;
    dragState.progress = 1;
    endDrag();
  }

  document.addEventListener("keydown", (e) => {
    if (reader.classList.contains("hidden")) return;
    if (document.activeElement === pageEditable) return;
    if (e.key === "ArrowRight") quickFlip("next");
    if (e.key === "ArrowLeft") quickFlip("prev");
    if (e.key === "Escape") closeReaderFn();
  });

  // ---------- init ----------
  render();
})();

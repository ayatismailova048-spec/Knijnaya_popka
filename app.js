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
  const bookSpineSide = document.getElementById("bookSpineSide");
  const pageArea = document.getElementById("pageArea");
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

  function openReader(shelfId, bookId) {
    currentShelfId = shelfId;
    currentBookId = bookId;
    const book = getCurrentBook();
    if (!book) return;
    currentPage = 0;
    bookSpineSide.style.setProperty("--spine-color", shadeColor(book.color, -10));
    reader.classList.remove("hidden");
    renderPage();
  }

  function closeReaderFn() {
    saveCurrentPageText();
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

  function startDrag(direction, clientX) {
    const book = getCurrentBook();
    if (!book || isFlipping) return null;
    const targetPage = direction === "next" ? currentPage + 1 : currentPage - 1;
    if (direction === "prev" && targetPage < 0) return null;
    const isNew = direction === "next" && targetPage >= book.pages.length;

    saveCurrentPageText();
    isFlipping = true;

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

    return {
      direction, targetPage, isNew, flipPage, shade,
      startX: clientX, startDeg, endDeg,
      width: Math.max(1, pageArea.getBoundingClientRect().width),
      progress: 0, moved: false
    };
  }

  function updateDrag(clientX) {
    if (!dragState) return;
    const dx = clientX - dragState.startX;
    const dir = dragState.direction === "next" ? -1 : 1;
    const raw = (dx * dir) / (dragState.width * 0.85);
    const progress = Math.max(0, Math.min(1, raw));
    dragState.progress = progress;
    const deg = dragState.startDeg + (dragState.endDeg - dragState.startDeg) * progress;
    dragState.flipPage.style.transform = `rotateY(${deg}deg)`;
    dragState.shade.style.opacity = String(Math.sin(progress * Math.PI) * 0.9);
  }

  function endDrag() {
    if (!dragState) return;
    const ds = dragState;
    dragState = null;
    const book = getCurrentBook();
    const willCommit = ds.moved ? ds.progress > 0.32 : true; // a plain tap always completes the flip

    ds.flipPage.style.transition = "transform 0.35s cubic-bezier(.4,.1,.2,1), opacity 0.35s ease";
    ds.shade.style.transition = "opacity 0.35s ease";

    if (willCommit) {
      ds.flipPage.style.transform = `rotateY(${ds.endDeg}deg)`;
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
      }, 360);
    } else {
      ds.flipPage.style.transform = `rotateY(${ds.startDeg}deg)`;
      ds.shade.style.opacity = "0";
      setTimeout(() => {
        ds.flipPage.remove();
        pageEditable.style.opacity = "1";
        isFlipping = false;
      }, 360);
    }
  }

  function attachCornerDrag(el, direction) {
    el.addEventListener("pointerdown", (e) => {
      if (isFlipping) return;
      e.preventDefault();
      const ds = startDrag(direction, e.clientX);
      if (!ds) return;
      dragState = ds;
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }

      const onMove = (ev) => {
        if (!dragState) return;
        if (Math.abs(ev.clientX - dragState.startX) > 4) dragState.moved = true;
        updateDrag(ev.clientX);
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
    if (isFlipping) return;
    const ds = startDrag(direction, 0);
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

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
  const hueRange = document.getElementById("hueRange");
  const satRange = document.getElementById("satRange");
  const lightRange = document.getElementById("lightRange");
  const colorPreview = document.getElementById("colorPreview");
  const satFill = document.getElementById("satFill");
  const lightFill = document.getElementById("lightFill");
  const cancelAddBook = document.getElementById("cancelAddBook");
  const confirmAddBook = document.getElementById("confirmAddBook");

  const confirmModal = document.getElementById("confirmModal");
  const confirmText = document.getElementById("confirmText");
  const confirmYes = document.getElementById("confirmYes");
  const confirmNo = document.getElementById("confirmNo");

  const reader = document.getElementById("reader");
  const closeReader = document.getElementById("closeReader");
  const readerTitle = document.getElementById("readerTitle");
  const addPageBtn = document.getElementById("addPageBtn");
  const deletePageBtn = document.getElementById("deletePageBtn");
  const bookSpineSide = document.getElementById("bookSpineSide");
  const pageArea = document.getElementById("pageArea");
  const pageEditable = document.getElementById("pageEditable");
  const flipLayer = document.getElementById("flipLayer");
  const cornerNext = document.getElementById("cornerNext");
  const cornerPrev = document.getElementById("cornerPrev");
  const prevPageBtn = document.getElementById("prevPageBtn");
  const nextPageBtn = document.getElementById("nextPageBtn");
  const pageIndicator = document.getElementById("pageIndicator");

  let selectedColor = PALETTE[0];
  let currentBookId = null;
  let currentShelfId = null;
  let currentPage = 0;
  let isFlipping = false;

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

  // ---------- add book modal ----------
  function buildSwatches() {
    colorSwatches.innerHTML = "";
    PALETTE.forEach((color, i) => {
      const sw = document.createElement("div");
      sw.className = "swatch" + (i === 0 ? " selected" : "");
      sw.style.background = color;
      sw.addEventListener("click", () => {
        selectedColor = color;
        [...colorSwatches.children].forEach(c => c.classList.remove("selected"));
        sw.classList.add("selected");
        setPickerFromHex(color);
      });
      colorSwatches.appendChild(sw);
    });
  }
  buildSwatches();

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

  function updatePickerVisuals() {
    const h = Number(hueRange.value), s = Number(satRange.value), l = Number(lightRange.value);
    colorPreview.style.background = hslToHex(h, s, l);
    satFill.style.background = `linear-gradient(90deg, ${hslToHex(h, 0, l)}, ${hslToHex(h, 100, l)})`;
    lightFill.style.background = `linear-gradient(90deg, #000, ${hslToHex(h, s, 50)}, #fff)`;
  }

  function setPickerFromHex(hex) {
    const { h, s, l } = hexToHsl(hex);
    hueRange.value = h;
    satRange.value = s;
    lightRange.value = l;
    updatePickerVisuals();
  }

  [hueRange, satRange, lightRange].forEach(range => {
    range.addEventListener("input", () => {
      selectedColor = hslToHex(Number(hueRange.value), Number(satRange.value), Number(lightRange.value));
      updatePickerVisuals();
      [...colorSwatches.children].forEach(c => c.classList.remove("selected"));
    });
  });

  function openAddBookModal(shelfId) {
    pendingShelfIdForNewBook = shelfId;
    bookTitleInput.value = "";
    selectedColor = PALETTE[0];
    [...colorSwatches.children].forEach((c, i) => c.classList.toggle("selected", i === 0));
    setPickerFromHex(PALETTE[0]);
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
    readerTitle.textContent = book.title;
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
    pageIndicator.textContent = `Стр. ${currentPage + 1} из ${book.pages.length}`;
    prevPageBtn.disabled = currentPage === 0 || isFlipping;
    nextPageBtn.disabled = currentPage >= book.pages.length - 1 || isFlipping;
    pageEditable.style.opacity = "1";
  }

  function buildFlipFace(text, extraClass) {
    const face = document.createElement("div");
    face.className = "flip-face" + (extraClass ? " " + extraClass : "");
    face.textContent = text;
    return face;
  }

  function flip(direction) {
    const book = getCurrentBook();
    if (!book || isFlipping) return;
    const targetPage = direction === "next" ? currentPage + 1 : currentPage - 1;
    if (targetPage < 0 || targetPage >= book.pages.length) return;

    saveCurrentPageText();
    isFlipping = true;
    prevPageBtn.disabled = true;
    nextPageBtn.disabled = true;

    playPageFlipSound();

    const flipPage = document.createElement("div");
    flipPage.className = "flip-page";

    const currentText = book.pages[currentPage] || "";
    const targetText = book.pages[targetPage] || "";

    const shade = document.createElement("div");
    shade.className = "flip-shade";

    if (direction === "next") {
      const front = buildFlipFace(currentText);
      const back = buildFlipFace(targetText, "back");
      flipPage.appendChild(front);
      flipPage.appendChild(back);
      flipPage.appendChild(shade);
      flipPage.style.transform = "rotateY(0deg)";
      pageEditable.style.opacity = "0";
      flipLayer.appendChild(flipPage);
      // force reflow then animate
      void flipPage.offsetWidth;
      flipPage.style.transition = "transform 0.62s cubic-bezier(.4,.1,.2,1)";
      shade.style.transition = "opacity 0.62s ease";
      requestAnimationFrame(() => {
        flipPage.style.transform = "rotateY(-180deg)";
        shade.style.opacity = "1";
        setTimeout(() => { shade.style.opacity = "0"; }, 310);
      });
    } else {
      const front = buildFlipFace(targetText);
      const back = buildFlipFace(currentText, "back");
      flipPage.appendChild(front);
      flipPage.appendChild(back);
      flipPage.appendChild(shade);
      flipPage.style.transform = "rotateY(-180deg)";
      pageEditable.style.opacity = "0";
      flipLayer.appendChild(flipPage);
      void flipPage.offsetWidth;
      flipPage.style.transition = "transform 0.62s cubic-bezier(.4,.1,.2,1)";
      shade.style.transition = "opacity 0.62s ease";
      requestAnimationFrame(() => {
        flipPage.style.transform = "rotateY(0deg)";
        shade.style.opacity = "1";
        setTimeout(() => { shade.style.opacity = "0"; }, 310);
      });
    }

    setTimeout(() => {
      flipPage.remove();
      currentPage = targetPage;
      isFlipping = false;
      renderPage();
    }, 640);
  }

  cornerNext.addEventListener("click", () => flip("next"));
  cornerPrev.addEventListener("click", () => flip("prev"));
  nextPageBtn.addEventListener("click", () => flip("next"));
  prevPageBtn.addEventListener("click", () => flip("prev"));

  addPageBtn.addEventListener("click", () => {
    const book = getCurrentBook();
    if (!book || isFlipping) return;
    saveCurrentPageText();
    book.pages.push("");
    saveState();
    flip("next");
  });

  deletePageBtn.addEventListener("click", () => {
    const book = getCurrentBook();
    if (!book || isFlipping) return;
    if (book.pages.length <= 1) {
      askConfirm("Это единственная страница в книге. Очистить её текст?", () => {
        book.pages[0] = "";
        saveState();
        renderPage();
      });
      return;
    }
    askConfirm(`Удалить страницу ${currentPage + 1}?`, () => {
      book.pages.splice(currentPage, 1);
      if (currentPage >= book.pages.length) currentPage = book.pages.length - 1;
      saveState();
      renderPage();
    });
  });

  document.addEventListener("keydown", (e) => {
    if (reader.classList.contains("hidden")) return;
    if (document.activeElement === pageEditable) return;
    if (e.key === "ArrowRight") flip("next");
    if (e.key === "ArrowLeft") flip("prev");
    if (e.key === "Escape") closeReaderFn();
  });

  // ---------- init ----------
  render();
})();

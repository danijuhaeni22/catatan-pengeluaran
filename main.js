(() => {
  /********************
   * CONFIG
   ********************/
  const STORAGE_KEY = "expense_dashboard_v1";
  const DEFAULT_CATEGORIES = [
    "Makan",
    "Transport",
    "Tagihan",
    "Belanja",
    "Kesehatan",
    "Hiburan",
    "Pendidikan",
    "Donasi",
    "Lainnya",
  ];

  const CATEGORY_COLOR = {
    Makan: "#22c55e",
    Transport: "#38bdf8",
    Tagihan: "#ef4444",
    Belanja: "#a78bfa",
    Kesehatan: "#14b8a6",
    Hiburan: "#f59e0b",
    Pendidikan: "#6366f1",
    Donasi: "#fb7185",
    Lainnya: "#94a3b8",
  };

  const FALLBACK_COLORS = [
    "#22c55e",
    "#38bdf8",
    "#f59e0b",
    "#ef4444",
    "#a78bfa",
    "#14b8a6",
    "#6366f1",
    "#fb7185",
    "#94a3b8",
    "#f97316",
    "#84cc16",
    "#0ea5e9",
  ];

  /********************
   * HELPERS
   ********************/
  const pad2 = (n) => String(n).padStart(2, "0");
  const toISODate = (d) =>
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

  const fmtIDR = (n) => "Rp " + Number(n || 0).toLocaleString("id-ID");

  function formatRupiahDigits(raw) {
    // raw: string apapun -> sisakan angka saja
    const digits = String(raw || "").replace(/[^\d]/g, "");
    if (!digits) return "";
    // format ribuan: 35000 -> 35.000
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }

  function parseRupiahToNumber(raw) {
    // "35.000" -> 35000
    const digits = String(raw || "").replace(/[^\d]/g, "");
    return digits ? Number(digits) : 0;
  }

  const parseMonthInput = (val) => {
    const [y, m] = val.split("-").map(Number);
    return { y, m };
  };

  const startOfMonth = (y, m1) => new Date(y, m1 - 1, 1);
  const endOfMonth = (y, m1) => new Date(y, m1, 0, 23, 59, 59, 999);

  const isSameMonth = (d, y, m1) =>
    d.getFullYear() === y && d.getMonth() === m1 - 1;

  function getWeeksInMonth(y, m1) {
    const first = startOfMonth(y, m1);
    const last = endOfMonth(y, m1);

    const dayMon0 = (jsDay) => (jsDay + 6) % 7;

    const weeks = [];
    let cur = new Date(first);

    const offset = dayMon0(cur.getDay());
    cur.setDate(cur.getDate() - offset);

    let idx = 1;
    while (cur <= last) {
      const wStart = new Date(cur);
      const wEnd = new Date(cur);
      wEnd.setDate(wEnd.getDate() + 6);
      wEnd.setHours(23, 59, 59, 999);

      const inMonthStart = new Date(
        Math.max(wStart.getTime(), first.getTime())
      );
      const inMonthEnd = new Date(Math.min(wEnd.getTime(), last.getTime()));

      const label = `Minggu ${idx} (${pad2(inMonthStart.getDate())}-${pad2(
        inMonthEnd.getDate()
      )})`;
      weeks.push({ start: inMonthStart, end: inMonthEnd, label });

      idx++;
      cur.setDate(cur.getDate() + 7);
    }
    return weeks;
  }

  const clampStr = (s, max = 60) => {
    s = String(s || "").trim();
    if (s.length <= max) return s;
    return s.slice(0, max - 1) + "…";
  };

  function downloadText(filename, text) {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  /********************
   * ✅ CUSTOM SELECT
   ********************/
  const CustomSelectRegistry = (() => {
    const map = new Map(); // selectEl -> instance
    const closeAll = (except) => {
      for (const inst of map.values()) {
        if (inst !== except) inst.close();
      }
    };

    // close when click outside
    document.addEventListener("click", (e) => {
      const t = e.target;
      for (const inst of map.values()) {
        if (!inst.root.contains(t)) inst.close();
      }
    });

    // close on escape
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      for (const inst of map.values()) inst.close();
    });

    return {
      create(selectEl, opts) {
        const inst = new CustomSelect(selectEl, opts, closeAll);
        map.set(selectEl, inst);
        return inst;
      },
      get(selectEl) {
        return map.get(selectEl);
      },
      refresh(selectEl) {
        const inst = map.get(selectEl);
        if (inst) inst.refresh();
      },
      closeAll,
    };
  })();

  class CustomSelect {
    constructor(selectEl, opts, closeAll) {
      this.selectEl = selectEl;
      this.closeAll = closeAll;
      this.opts = {
        placeholder: "Pilih...",
        showSearch: false,
        dotByCategory: false,
        ...opts,
      };

      this.root = document.createElement("div");
      this.root.className = "cselect";

      // hide native but keep in DOM for validation/events
      this.selectEl.classList.add("cselect-native");

      this.btn = document.createElement("button");
      this.btn.type = "button";
      this.btn.className = "cselect-btn";
      this.btn.setAttribute("aria-haspopup", "listbox");
      this.btn.setAttribute("aria-expanded", "false");

      this.valueWrap = document.createElement("div");
      this.valueWrap.className = "cselect-value";

      this.primary = document.createElement("div");
      this.primary.className = "primary";
      this.secondary = document.createElement("div");
      this.secondary.className = "secondary";

      this.valueWrap.append(this.primary, this.secondary);

      this.chev = document.createElement("span");
      this.chev.className = "cselect-chevron";

      this.btn.append(this.valueWrap, this.chev);

      this.menu = document.createElement("div");
      this.menu.className = "cselect-menu";

      this.searchWrap = document.createElement("div");
      this.searchWrap.className = "cselect-search";
      this.searchInput = document.createElement("input");
      this.searchInput.type = "text";
      this.searchInput.placeholder = "Cari...";
      this.searchWrap.appendChild(this.searchInput);

      this.list = document.createElement("div");
      this.list.className = "cselect-list";
      this.list.setAttribute("role", "listbox");

      if (this.opts.showSearch) this.menu.appendChild(this.searchWrap);
      this.menu.appendChild(this.list);

      this.root.append(this.btn, this.menu);

      // insert custom UI after select
      this.selectEl.insertAdjacentElement("afterend", this.root);

      // wire
      this.btn.addEventListener("click", () => {
        if (this.isOpen()) this.close();
        else this.open();
      });

      this.searchInput.addEventListener("input", () => this.renderItems());

      this.selectEl.addEventListener("change", () => {
        this.syncFromNative();
        this.renderItems(); // update selected highlight
      });

      // keyboard minimal
      this.btn.addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          this.open();
          this.focusFirst();
        }
      });

      this.refresh();
    }

    isOpen() {
      return this.root.classList.contains("open");
    }

    open() {
      if (this.selectEl.disabled) return;
      this.closeAll(this);
      this.root.classList.add("open");
      this.btn.setAttribute("aria-expanded", "true");
      if (this.opts.showSearch) {
        this.searchInput.value = "";
        this.searchInput.focus();
      }
      this.renderItems();
    }

    close() {
      this.root.classList.remove("open");
      this.btn.setAttribute("aria-expanded", "false");
    }

    refresh() {
      this.syncFromNative();
      this.renderItems();
    }

    syncFromNative() {
      const opt = this.selectEl.selectedOptions?.[0] || null;
      const text = opt ? opt.textContent : "";
      this.primary.textContent = text || this.opts.placeholder;

      // secondary line (optional)
      if (this.selectEl.id === "mode") {
        this.secondary.textContent =
          this.selectEl.value === "weekly"
            ? "Filter per minggu dalam bulan"
            : "Akumulasi per bulan dalam tahun";
      } else if (this.selectEl.id === "catFilter") {
        this.secondary.textContent = this.selectEl.value
          ? "Filter kategori aktif"
          : "Semua kategori";
      } else if (this.selectEl.id === "week") {
        this.secondary.textContent = "Dalam bulan terpilih";
      } else if (this.selectEl.id === "fMethod") {
        this.secondary.textContent = "Metode pembayaran";
      } else if (this.selectEl.id === "fCategory") {
        this.secondary.textContent = "Kategori transaksi";
      } else {
        this.secondary.textContent = "";
      }
    }

    getFilterText() {
      if (!this.opts.showSearch) return "";
      return (this.searchInput.value || "").trim().toLowerCase();
    }

    renderItems() {
      const q = this.getFilterText();
      const selectedVal = this.selectEl.value;

      this.list.innerHTML = "";

      const opts = Array.from(this.selectEl.options);
      const filtered = q
        ? opts.filter((o) => (o.textContent || "").toLowerCase().includes(q))
        : opts;

      if (!filtered.length) {
        const empty = document.createElement("div");
        empty.className = "cselect-item";
        empty.style.cursor = "default";
        empty.style.opacity = "0.7";
        empty.textContent = "Tidak ada hasil";
        this.list.appendChild(empty);
        return;
      }

      filtered.forEach((o, idx) => {
        const item = document.createElement("div");
        item.className = "cselect-item";
        item.setAttribute("role", "option");
        item.setAttribute("data-value", o.value);
        item.tabIndex = 0;

        const isSel = o.value === selectedVal;
        item.setAttribute("aria-selected", isSel ? "true" : "false");

        const left = document.createElement("div");
        left.style.display = "flex";
        left.style.alignItems = "center";
        left.style.gap = "10px";
        left.style.minWidth = "0";

        const dot = document.createElement("span");
        dot.className = "cselect-dot";

        // dot color for categories (nice touch)
        if (this.opts.dotByCategory) {
          const c =
            CATEGORY_COLOR[o.value] ||
            FALLBACK_COLORS[idx % FALLBACK_COLORS.length];
          dot.style.background = c;
          dot.style.borderColor = "rgba(255,255,255,0.18)";
        }

        const text = document.createElement("div");
        text.style.minWidth = "0";
        text.style.whiteSpace = "nowrap";
        text.style.overflow = "hidden";
        text.style.textOverflow = "ellipsis";
        text.textContent = o.textContent || "";

        if (this.opts.dotByCategory) left.append(dot, text);
        else left.append(text);

        const right = document.createElement("div");
        right.style.opacity = isSel ? "1" : "0";
        right.textContent = "✓";

        item.append(left, right);

        item.addEventListener("click", () => this.pick(o.value));
        item.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            this.pick(o.value);
          }
        });

        this.list.appendChild(item);
      });
    }

    pick(value) {
      if (this.selectEl.value === value) {
        this.close();
        return;
      }
      this.selectEl.value = value;
      // trigger native change so kode kamu tetap jalan
      this.selectEl.dispatchEvent(new Event("change", { bubbles: true }));
      this.close();
      this.btn.focus();
    }

    focusFirst() {
      const first = this.list.querySelector(".cselect-item[role='option']");
      if (first) first.focus();
    }
  }

  function enhanceSelectsOnce() {
    const selects = document.querySelectorAll("select.js-custom-select");
    selects.forEach((s) => {
      if (CustomSelectRegistry.get(s)) return;

      const isCategory = s.id === "catFilter" || s.id === "fCategory";

      CustomSelectRegistry.create(s, {
        // search only for category + week (optional)
        showSearch: s.id === "week" || isCategory,
        dotByCategory: isCategory,
      });
    });
  }

  /********************
   * DATA LAYER
   ********************/
  function loadData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr
        .map((x) => ({
          id: String(x.id || crypto.randomUUID()),
          date: String(x.date),
          category: String(x.category || "Lainnya"),
          desc: String(x.desc || ""),
          amount: Number(x.amount || 0),
          method: String(x.method || "Cash"),
        }))
        .filter((x) => !!x.date && !Number.isNaN(new Date(x.date).getTime()));
    } catch {
      return [];
    }
  }

  const saveData = (list) =>
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));

  function addExpense(item) {
    const list = loadData();
    list.push(item);
    saveData(list);
  }

  function removeExpense(id) {
    const list = loadData().filter((x) => x.id !== id);
    saveData(list);
  }

  function seedSample() {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    const base = startOfMonth(y, m);

    const pick = (a) => a[Math.floor(Math.random() * a.length)];
    const methods = ["Cash", "E-Wallet", "Transfer", "Kartu"];
    const cats = DEFAULT_CATEGORIES;

    const samples = [];
    for (let i = 0; i < 35; i++) {
      const d = new Date(base);
      d.setDate(1 + Math.floor(Math.random() * 28));

      const cat = pick(cats);
      const method = pick(methods);
      const amount =
        cat === "Tagihan"
          ? 150000 + Math.floor(Math.random() * 600000)
          : cat === "Makan"
          ? 15000 + Math.floor(Math.random() * 120000)
          : cat === "Transport"
          ? 10000 + Math.floor(Math.random() * 200000)
          : 20000 + Math.floor(Math.random() * 250000);

      const desc =
        cat === "Makan"
          ? pick(["Lunch", "Kopi", "Makan malam", "Snack"])
          : cat === "Transport"
          ? pick(["Bensin", "Parkir", "Ojol", "Tol"])
          : cat === "Tagihan"
          ? pick(["Listrik", "Internet", "Air", "Cicilan"])
          : pick([
              "Belanja kebutuhan",
              "Keperluan rumah",
              "Langganan",
              "Lain-lain",
            ]);

      samples.push({
        id: crypto.randomUUID(),
        date: toISODate(d),
        category: cat,
        desc,
        amount,
        method,
      });
    }

    saveData(samples);
  }

  /********************
   * UI ELEMENTS
   ********************/
  const el = {
    mode: document.getElementById("mode"),
    month: document.getElementById("month"),
    week: document.getElementById("week"),
    catFilter: document.getElementById("catFilter"),
    q: document.getElementById("q"),

    kTotal: document.getElementById("kTotal"),
    kTotalSub: document.getElementById("kTotalSub"),
    kAvg: document.getElementById("kAvg"),
    kAvgSub: document.getElementById("kAvgSub"),
    kPeak: document.getElementById("kPeak"),
    kPeakSub: document.getElementById("kPeakSub"),
    kCat: document.getElementById("kCat"),
    kCatSub: document.getElementById("kCatSub"),

    pillTotal: document.getElementById("pillTotal"),
    pillAvg: document.getElementById("pillAvg"),
    pillPeak: document.getElementById("pillPeak"),
    pillCat: document.getElementById("pillCat"),

    titleTrend: document.getElementById("titleTrend"),
    hintTrend: document.getElementById("hintTrend"),
    hintCat: document.getElementById("hintCat"),
    hintTable: document.getElementById("hintTable"),

    tbody: document.getElementById("tbody"),

    form: document.getElementById("formExpense"),
    fDate: document.getElementById("fDate"),
    fAmount: document.getElementById("fAmount"),
    fCategory: document.getElementById("fCategory"),
    fMethod: document.getElementById("fMethod"),
    fDesc: document.getElementById("fDesc"),

    btnSeed: document.getElementById("btnSeed"),
    btnReset: document.getElementById("btnReset"),
    btnExport: document.getElementById("btnExport"),
  };

  function initMonthAndDate() {
    const now = new Date();
    el.month.value = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
    el.fDate.value = toISODate(now);
  }

  function renderCategoryOptions() {
    el.fCategory.innerHTML = "";
    for (const c of DEFAULT_CATEGORIES) {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      el.fCategory.appendChild(opt);
    }

    const prev = el.catFilter.value;
    el.catFilter.innerHTML = `<option value="">Semua</option>`;
    for (const c of DEFAULT_CATEGORIES) {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      el.catFilter.appendChild(opt);
    }
    el.catFilter.value = prev && DEFAULT_CATEGORIES.includes(prev) ? prev : "";

    // ✅ refresh custom dropdown UI
    CustomSelectRegistry.refresh(el.fCategory);
    CustomSelectRegistry.refresh(el.catFilter);
  }

  let cachedWeeks = [];
  function renderWeeks() {
    const { y, m } = parseMonthInput(el.month.value);
    cachedWeeks = getWeeksInMonth(y, m);

    el.week.innerHTML = "";
    cachedWeeks.forEach((w, idx) => {
      const opt = document.createElement("option");
      opt.value = String(idx);
      opt.textContent = w.label;
      el.week.appendChild(opt);
    });

    const today = new Date();
    let pickIdx = 0;
    if (today.getFullYear() === y && today.getMonth() === m - 1) {
      const found = cachedWeeks.findIndex(
        (w) => today >= w.start && today <= w.end
      );
      pickIdx = found >= 0 ? found : 0;
    }
    el.week.value = String(pickIdx);

    // ✅ refresh custom dropdown UI
    CustomSelectRegistry.refresh(el.week);
  }

  function syncModeUI() {
    const weekly = el.mode.value === "weekly";
    el.week.disabled = !weekly;

    // biar custom button keliatan disabled
    el.week.parentElement.style.opacity = weekly ? "1" : "0.6";
    CustomSelectRegistry.refresh(el.mode);
    CustomSelectRegistry.refresh(el.week);
  }

  /********************
   * FILTER + AGG
   ********************/
  function getFilteredData() {
    const list = loadData();
    const mode = el.mode.value;
    const q = el.q.value.trim().toLowerCase();
    const cat = el.catFilter.value;

    if (mode === "weekly") {
      const { y, m } = parseMonthInput(el.month.value);
      const w = cachedWeeks[Number(el.week.value) || 0] || cachedWeeks[0];

      return list
        .filter((x) => {
          const d = new Date(x.date);
          if (!isSameMonth(d, y, m)) return false;
          if (!(d >= w.start && d <= w.end)) return false;
          if (cat && x.category !== cat) return false;
          if (q) {
            const hay = `${x.desc} ${x.method} ${x.category}`.toLowerCase();
            if (!hay.includes(q)) return false;
          }
          return true;
        })
        .sort((a, b) => (a.date < b.date ? 1 : -1));
    }

    const { y } = parseMonthInput(el.month.value);
    return list
      .filter((x) => {
        const d = new Date(x.date);
        if (d.getFullYear() !== y) return false;
        if (cat && x.category !== cat) return false;
        if (q) {
          const hay = `${x.desc} ${x.method} ${x.category}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }

  function sumBy(list, keyFn) {
    const m = new Map();
    for (const x of list) {
      const k = keyFn(x);
      m.set(k, (m.get(k) || 0) + (Number(x.amount) || 0));
    }
    return m;
  }

  function computeKPI(list, periodLabel) {
    const total = list.reduce((s, x) => s + (Number(x.amount) || 0), 0);

    let avg = 0;
    let avgLabel = "—";
    let peakValue = 0;
    let peakLabel = "—";

    const byCat = sumBy(list, (x) => x.category);
    let topCat = "—";
    let topCatVal = 0;
    for (const [k, v] of byCat.entries()) {
      if (v > topCatVal) {
        topCatVal = v;
        topCat = k;
      }
    }

    if (el.mode.value === "weekly") {
      const w = cachedWeeks[Number(el.week.value) || 0] || cachedWeeks[0];
      const days = Math.max(1, Math.round((w.end - w.start) / 86400000) + 1);
      avg = total / days;
      avgLabel = `Per hari (≈ ${days} hari)`;

      const byDay = sumBy(list, (x) => x.date);
      let bestDay = "";
      for (const [k, v] of byDay.entries()) {
        if (v > peakValue) {
          peakValue = v;
          bestDay = k;
        }
      }
      peakLabel = bestDay ? `Tanggal ${bestDay}` : "—";
    } else {
      const { y } = parseMonthInput(el.month.value);

      const months = new Set(list.map((x) => new Date(x.date).getMonth()));
      const denom = Math.max(1, months.size || 0);
      avg = total / denom;
      avgLabel = `Per bulan (tahun ${y})`;

      const byMonth = sumBy(list, (x) => {
        const d = new Date(x.date);
        return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
      });

      let bestMonth = "";
      for (const [k, v] of byMonth.entries()) {
        if (v > peakValue) {
          peakValue = v;
          bestMonth = k;
        }
      }
      peakLabel = bestMonth ? `Bulan ${bestMonth}` : "—";
    }

    return {
      total,
      avg,
      avgLabel,
      peakValue,
      peakLabel,
      topCat,
      topCatVal,
      periodLabel,
    };
  }

  /********************
   * CHARTS
   ********************/
  let trendChart = null;
  let catChart = null;

  function baseXYChartOptions() {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "nearest", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "rgba(0,0,0,0.85)",
          titleColor: "rgba(255,255,255,0.95)",
          bodyColor: "rgba(255,255,255,0.92)",
          borderColor: "rgba(255,255,255,0.20)",
          borderWidth: 1,
          padding: 10,
          displayColors: false,
          callbacks: {
            label: (ctx) => ` ${fmtIDR(ctx.parsed.y ?? ctx.parsed)}`,
          },
        },
      },
      scales: {
        x: {
          ticks: { color: "rgba(255,255,255,0.70)" },
          grid: { color: "rgba(255,255,255,0.06)" },
        },
        y: {
          ticks: {
            color: "rgba(255,255,255,0.70)",
            callback: (v) => {
              const n = Number(v || 0);
              if (n >= 1_000_000)
                return (n / 1_000_000).toFixed(1).replace(".", ",") + "jt";
              if (n >= 1_000) return (n / 1_000).toFixed(0) + "k";
              return String(n);
            },
          },
          grid: { color: "rgba(255,255,255,0.06)" },
        },
      },
    };
  }

  function upsertTrendChart(labels, values, labelName) {
    const ctx = document.getElementById("trendChart");
    const data = {
      labels,
      datasets: [
        {
          label: labelName,
          data: values,
          borderWidth: 2.5,
          tension: 0.35,
          pointRadius: 2.8,
          pointHoverRadius: 5,
          fill: true,
          borderColor: "rgba(96,165,250,0.95)",
          backgroundColor: "rgba(96,165,250,0.18)",
        },
      ],
    };

    const opts = baseXYChartOptions();

    if (!trendChart) {
      trendChart = new Chart(ctx, { type: "line", data, options: opts });
    } else {
      trendChart.data.labels = labels;
      trendChart.data.datasets[0].data = values;
      trendChart.data.datasets[0].label = labelName;
      trendChart.update();
    }
  }

  function colorForCategory(label, idx) {
    if (CATEGORY_COLOR[label]) return CATEGORY_COLOR[label];
    return FALLBACK_COLORS[idx % FALLBACK_COLORS.length];
  }

  function upsertCatChart(labels, values) {
    const ctx = document.getElementById("catChart");
    const colors = labels.map((l, i) => colorForCategory(l, i));

    const data = {
      labels,
      datasets: [
        {
          label: "Kategori",
          data: values,
          backgroundColor: colors,
          borderColor: "#0b1020",
          borderWidth: 2,
          hoverOffset: 6,
        },
      ],
    };

    const opts = {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "62%",
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "rgba(0,0,0,0.85)",
          titleColor: "rgba(255,255,255,0.95)",
          bodyColor: "rgba(255,255,255,0.92)",
          borderColor: "rgba(255,255,255,0.20)",
          borderWidth: 1,
          padding: 10,
          displayColors: true,
          callbacks: {
            label: (ctx) => {
              const label = ctx.label || "";
              const v = ctx.parsed || 0;
              return ` ${label}: ${fmtIDR(v)}`;
            },
          },
        },
      },
    };

    if (!catChart) {
      catChart = new Chart(ctx, { type: "doughnut", data, options: opts });
    } else {
      catChart.data.labels = labels;
      catChart.data.datasets[0].data = values;
      catChart.data.datasets[0].backgroundColor = colors;
      catChart.update();
    }
  }

  /********************
   * RENDER
   ********************/
  function getPeriodLabel() {
    if (el.mode.value === "weekly") {
      const w = cachedWeeks[Number(el.week.value) || 0] || cachedWeeks[0];
      return `Minggu (${toISODate(w.start)} s/d ${toISODate(w.end)})`;
    }
    const { y } = parseMonthInput(el.month.value);
    return `Tahun ${y} (akumulasi per bulan)`;
  }

  function renderTable(list) {
    el.tbody.innerHTML = "";
    if (!list.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 6;
      td.style.padding = "14px 12px";
      td.innerHTML = `<span class="muted">Tidak ada data untuk filter ini.</span>`;
      tr.appendChild(td);
      el.tbody.appendChild(tr);
      return;
    }

    for (const x of list) {
      const tr = document.createElement("tr");

      const tdDate = document.createElement("td");
      tdDate.textContent = x.date;

      const tdCat = document.createElement("td");
      tdCat.textContent = x.category;

      const tdDesc = document.createElement("td");
      tdDesc.textContent = clampStr(x.desc || "-", 80);

      const tdMethod = document.createElement("td");
      tdMethod.textContent = x.method;

      const tdAmt = document.createElement("td");
      tdAmt.className = "td-amt";
      tdAmt.textContent = fmtIDR(x.amount);

      const tdAct = document.createElement("td");
      tdAct.className = "td-actions";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "mini-btn btn-ghost";
      btn.textContent = "Hapus";
      btn.addEventListener("click", () => {
        removeExpense(x.id);
        renderAll();
      });
      tdAct.appendChild(btn);

      tr.append(tdDate, tdCat, tdDesc, tdMethod, tdAmt, tdAct);
      el.tbody.appendChild(tr);
    }
  }

  function renderKPI(k) {
    el.kTotal.textContent = fmtIDR(k.total);
    el.kTotalSub.textContent = `Periode: ${k.periodLabel}`;

    el.kAvg.textContent = fmtIDR(k.avg);
    el.kAvgSub.textContent = k.avgLabel;

    el.kPeak.textContent = fmtIDR(k.peakValue);
    el.kPeakSub.textContent = k.peakLabel;

    el.kCat.textContent = k.topCat;
    el.kCatSub.textContent =
      k.topCat === "—" ? "—" : `${fmtIDR(k.topCatVal)} (terbesar)`;

    el.pillTotal.className = `pill ${k.total === 0 ? "warn" : "ok"}`;
    el.pillTotal.textContent = k.total === 0 ? "Kosong" : "Aktif";

    el.pillAvg.className = "pill";
    el.pillAvg.textContent =
      el.mode.value === "weekly" ? "Per hari" : "Per bulan";

    el.pillPeak.className = `pill ${k.peakValue > 0 ? "warn" : ""}`.trim();
    el.pillPeak.textContent = k.peakValue > 0 ? "Puncak" : "—";

    el.pillCat.className = `pill ${k.topCatVal > 0 ? "ok" : ""}`.trim();
    el.pillCat.textContent = k.topCatVal > 0 ? "Top" : "—";
  }

  function buildTrend(list) {
    if (el.mode.value === "weekly") {
      const w = cachedWeeks[Number(el.week.value) || 0] || cachedWeeks[0];

      const labels = [];
      const values = [];
      const byDay = sumBy(list, (x) => x.date);

      const cur = new Date(w.start);
      cur.setHours(0, 0, 0, 0);
      const end = new Date(w.end);
      end.setHours(0, 0, 0, 0);

      while (cur <= end) {
        const iso = toISODate(cur);
        labels.push(iso.slice(5));
        values.push(byDay.get(iso) || 0);
        cur.setDate(cur.getDate() + 1);
      }

      const total = values.reduce((s, v) => s + v, 0);
      el.titleTrend.textContent = "Tren Pengeluaran (Harian)";
      el.hintTrend.textContent = `Total minggu ini: ${fmtIDR(total)}`;
      upsertTrendChart(labels, values, "Harian");
      return;
    }

    const { y } = parseMonthInput(el.month.value);
    const byMonth = sumBy(list, (x) => new Date(x.date).getMonth());

    const labels = [];
    const values = [];
    for (let i = 0; i < 12; i++) {
      labels.push(`${pad2(i + 1)}`);
      values.push(byMonth.get(i) || 0);
    }

    const total = values.reduce((s, v) => s + v, 0);
    el.titleTrend.textContent = "Tren Pengeluaran (Bulanan)";
    el.hintTrend.textContent = `Total tahun ${y}: ${fmtIDR(total)}`;
    upsertTrendChart(labels, values, "Bulanan");
  }

  function buildCategory(list) {
    const byCat = sumBy(list, (x) => x.category);

    const entries = Array.from(byCat.entries()).sort((a, b) => b[1] - a[1]);
    const top = entries.slice(0, 7);
    const rest = entries.slice(7);

    const labels = top.map(([k]) => k);
    const values = top.map(([, v]) => v);

    if (rest.length) {
      const restSum = rest.reduce((s, [, v]) => s + v, 0);
      labels.push("Lainnya (gabungan)");
      values.push(restSum);
    }

    const total = values.reduce((s, v) => s + v, 0);
    el.hintCat.textContent = total ? `Total: ${fmtIDR(total)}` : "—";
    upsertCatChart(labels, values);
  }

  function renderAll() {
    const filtered = getFilteredData();
    const periodLabel = getPeriodLabel();

    const k = computeKPI(filtered, periodLabel);
    renderKPI(k);

    buildTrend(filtered);
    buildCategory(filtered);

    renderTable(filtered);

    el.hintTable.textContent = filtered.length
      ? `${filtered.length} transaksi (sesuai filter)`
      : "—";

    // keep UI sync
    CustomSelectRegistry.refresh(el.mode);
    CustomSelectRegistry.refresh(el.week);
    CustomSelectRegistry.refresh(el.catFilter);
    CustomSelectRegistry.refresh(el.fCategory);
    CustomSelectRegistry.refresh(el.fMethod);
  }

  /********************
   * EVENTS
   ********************/
  function wireEvents() {
    el.month.addEventListener("change", () => {
      renderWeeks();
      renderAll();
    });

    el.mode.addEventListener("change", () => {
      syncModeUI();
      renderAll();
    });

    el.week.addEventListener("change", renderAll);
    el.catFilter.addEventListener("change", renderAll);

    el.q.addEventListener("input", () => {
      clearTimeout(el.q._t);
      el.q._t = setTimeout(renderAll, 120);
    });

    // Auto-format rupiah saat mengetik
    el.fAmount.addEventListener("input", () => {
      const before = el.fAmount.value;
      const after = formatRupiahDigits(before);

      // jaga caret biar tidak "loncat" parah
      const pos = el.fAmount.selectionStart || after.length;
      const diff = after.length - before.length;

      el.fAmount.value = after;
      const nextPos = Math.max(0, pos + diff);
      el.fAmount.setSelectionRange(nextPos, nextPos);
    });

    el.form.addEventListener("submit", (e) => {
      e.preventDefault();
      const date = el.fDate.value;
      const amount = parseRupiahToNumber(el.fAmount.value);
      const category = el.fCategory.value;
      const method = el.fMethod.value;
      const desc = (el.fDesc.value || "").trim();

      if (!date || amount <= 0 || !category || !method) return;

      addExpense({
        id: crypto.randomUUID(),
        date,
        category,
        method,
        desc,
        amount,
      });

      el.fAmount.value = "";
      el.fDesc.value = "";
      renderAll();
    });

    el.btnSeed.addEventListener("click", () => {
      seedSample();
      renderAll();
    });

    el.btnReset.addEventListener("click", () => {
      const ok = confirm(
        "Reset semua data pengeluaran? (data di browser akan dihapus)"
      );
      if (!ok) return;
      localStorage.removeItem(STORAGE_KEY);
      renderAll();
    });

    el.btnExport.addEventListener("click", () => {
      const data = getFilteredData();
      const rows = [
        ["Tanggal", "Kategori", "Deskripsi", "Metode", "Jumlah"].join(","),
      ];

      for (const x of data) {
        const cols = [
          x.date,
          `"${String(x.category).replaceAll('"', '""')}"`,
          `"${String(x.desc || "").replaceAll('"', '""')}"`,
          `"${String(x.method).replaceAll('"', '""')}"`,
          String(Number(x.amount || 0)),
        ];
        rows.push(cols.join(","));
      }

      const label = el.mode.value === "weekly" ? "mingguan" : "bulanan";
      downloadText(`pengeluaran_${label}.csv`, rows.join("\n"));
    });
  }

  /********************
   * BOOT
   ********************/
  function boot() {
    initMonthAndDate();
    renderCategoryOptions();
    renderWeeks();
    syncModeUI();

    // ✅ build custom dropdown UI once (after options exist)
    enhanceSelectsOnce();

    wireEvents();

    const data = loadData();
    if (!data.length) {
      const now = new Date();
      const y = now.getFullYear();
      const m = now.getMonth() + 1;
      const d1 = new Date(y, m - 1, Math.min(2, now.getDate()));
      const d2 = new Date(y, m - 1, Math.min(3, now.getDate()));
      saveData([
        {
          id: crypto.randomUUID(),
          date: toISODate(d1),
          category: "Makan",
          desc: "Contoh: makan siang",
          amount: 35000,
          method: "Cash",
        },
        {
          id: crypto.randomUUID(),
          date: toISODate(d2),
          category: "Transport",
          desc: "Contoh: bensin",
          amount: 100000,
          method: "E-Wallet",
        },
      ]);
    }

    renderAll();
  }

  boot();
})();

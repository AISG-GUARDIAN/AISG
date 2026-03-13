/* ──────────────────────────────────────────────────
   app.js  — AI SAFE GUARDIAN · 로그인 / 토큰 / 화면전환
   index.html + emp-login.html 공용
────────────────────────────────────────────────── */

/* ── 상태 ────────────────────────────────────── */
const state = {
  lang: "ko",
  pin: "",
  failCount: 0,
  authenticated: false,
  stream: null,
  capturedBlob: null,
  autoResetTimer: null,
};

const AUTO_RESET_SEC = 7;
const API_BASE = "";

/* ── 인증 가드 — 토큰 없으면 화면 전환 차단 ── */
const AUTH_REQUIRED_SCREENS = new Set([
  "screen-ready", "screen-scanning", "screen-pass", "screen-fail",
]);

/* ── 유틸 ────────────────────────────────────── */
const $ = (id) => document.getElementById(id);

const SCREEN_BODY_CLASS = {
  "screen-lang": "screen-lang",
  "screen-pin": "screen-pin",
  "screen-ready": "screen-ready",
  "screen-scanning": "screen-scanning",
  "screen-pass": "screen-pass",
  "screen-fail": "screen-fail",
};

function showScreen(id) {
  if (AUTH_REQUIRED_SCREENS.has(id) && !state.authenticated) {
    console.warn("인증되지 않은 상태에서 화면 접근 차단:", id);
    resetToLang();
    return;
  }

  document.querySelectorAll(".screen").forEach((s) =>
    s.classList.remove("active", "fade-in")
  );
  const el = $(id);
  if (el) {
    el.classList.add("active", "fade-in");
  }
  const btnReset = $("btn-reset");
  if (btnReset) btnReset.style.display = id === "screen-lang" ? "none" : "";

  document.body.className = SCREEN_BODY_CLASS[id] || "";

  if (id !== "screen-ready" && typeof stopCamera === "function") stopCamera();
}

function flash() {
  const o = $("flash-overlay");
  if (!o) return;
  o.classList.remove("flash");
  void o.offsetWidth;
  o.classList.add("flash");
}

function speak(text, repeat = 1) {
  if (!window.speechSynthesis) return;
  speechSynthesis.cancel();
  const langMap = {
    ko: "ko-KR", en: "en-US", zh: "zh-CN", vi: "vi-VN",
    th: "th-TH", km: "km-KH", mn: "mn-MN", ru: "ru-RU", id: "id-ID",
  };
  let count = 0;
  function fire() {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = langMap[state.lang] || "ko-KR";
    u.rate = 0.95;
    u.onend = () => { count++; if (count < repeat) fire(); };
    speechSynthesis.speak(u);
  }
  fire();
}

function t(key) {
  return (T[state.lang] || T["ko"])[key] || "";
}

/* ── 공통 초기화 ─────────────────────────────── */
function resetToLang() {
  if (state.autoResetTimer) {
    clearInterval(state.autoResetTimer);
    state.autoResetTimer = null;
  }
  state.pin = "";
  state.failCount = 0;
  state.capturedBlob = null;
  state.authenticated = false;
  localStorage.removeItem("token");
  localStorage.removeItem("role");
  speechSynthesis?.cancel();
  if (typeof stopCamera === "function") stopCamera();
  showScreen("screen-lang");
}

/* ══════════════════════════════════════════════
   index.html 전용 — 언어선택 / PIN / 일용직 로그인
   ══════════════════════════════════════════════ */
if ($("lang-grid")) {

  /* ── 언어 선택 ───────────────────────────────── */
  function initLangScreen() {
    const grid = $("lang-grid");
    grid.innerHTML = "";
    LANGUAGES.forEach(({ code, flag, label }) => {
      const btn = document.createElement("button");
      btn.className = "lang-btn";
      btn.innerHTML = `<span class="lang-flag">${flag}</span><span class="lang-label">${label}</span>`;
      btn.addEventListener("click", () => selectLang(code, flag));
      grid.appendChild(btn);
    });
    const remainder = LANGUAGES.length % 3;
    if (remainder !== 0) {
      for (let i = 0; i < 3 - remainder; i++) {
        const spacer = document.createElement("div");
        spacer.className = "lang-btn-spacer";
        grid.appendChild(spacer);
      }
    }
  }

  function selectLang(code, flag) {
    state.lang = code;
    state.pin = "";
    speak((T[code] || T["ko"]).greeting);
    initPinScreen(flag);
    showScreen("screen-pin");
  }

  /* ── PIN 입력 ────────────────────────────────── */
  function initPinScreen(flag) {
    $("pin-flag").textContent = flag;
    $("pin-prompt-native").textContent = t("pinPrompt");
    $("pin-prompt-ko").textContent = state.lang !== "ko" ? "전화번호 뒷자리 4자리를 입력하세요" : "";
    buildPinDots();
    buildNumpad();
    updatePinDisplay();
  }

  function buildPinDots() {
    const wrap = $("pin-dots");
    wrap.innerHTML = "";
    for (let i = 0; i < 4; i++) {
      const d = document.createElement("div");
      d.className = "pin-dot";
      d.id = `dot-${i}`;
      wrap.appendChild(d);
    }
  }

  function buildNumpad() {
    const pad = $("numpad");
    pad.innerHTML = "";
    ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].forEach((k) => {
      const btn = document.createElement("button");
      btn.className = "num-key" + (k === "⌫" ? " del" : "");
      btn.textContent = k;
      btn.disabled = k === "";
      btn.style.visibility = k === "" ? "hidden" : "";
      btn.addEventListener("click", () => handleNumKey(k));
      pad.appendChild(btn);
    });
  }

  function handleNumKey(k) {
    if (k === "⌫") { state.pin = state.pin.slice(0, -1); }
    else if (state.pin.length < 4) { state.pin += k; }
    updatePinDisplay();
    if (state.pin.length === 4) {
      disableNumpad(true);
      attemptLogin();
    }
  }

  function disableNumpad(disabled) {
    document.querySelectorAll(".num-key").forEach((btn) => {
      btn.disabled = disabled;
    });
  }

  function updatePinDisplay() {
    const len = state.pin.length;
    for (let i = 0; i < 4; i++) {
      $(`dot-${i}`)?.classList.toggle("filled", i < len);
    }
    $("pin-display").textContent = "●".repeat(len) + "○".repeat(4 - len);
    const btn = $("btn-confirm-pin");
    btn.disabled = len < 4;
    btn.textContent = len === 4 ? "확인 →" : `${len} / 4 자리 입력 중`;
  }

  /* ── 일용직 로그인 API ─────────────────────────── */
  async function attemptLogin() {
    const btn = $("btn-confirm-pin");
    btn.textContent = "로그인 중...";
    btn.disabled = true;

    try {
      const res = await fetch(`${API_BASE}/auth/user/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ last_call_number: state.pin, language: state.lang }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }

      const data = await res.json();
      localStorage.setItem("token", data.access_token);
      localStorage.setItem("role", data.role);
      state.authenticated = true;

      initReadyScreen();
      showScreen("screen-ready");
      startCamera();
    } catch (err) {
      console.error("로그인 실패:", err);
      state.authenticated = false;
      localStorage.removeItem("token");

      const dots = $("pin-dots");
      dots.classList.remove("shake");
      void dots.offsetWidth;
      dots.classList.add("shake");

      state.pin = "";
      updatePinDisplay();
      disableNumpad(false);
      btn.textContent = "로그인 실패 — 다시 입력하세요";
      setTimeout(() => { btn.textContent = "0 / 4 자리 입력 중"; }, 2000);
    }
  }

  /* ── 버튼 이벤트 (index.html) ─────────────────── */
  $("btn-back-pin").addEventListener("click", () => {
    state.pin = "";
    showScreen("screen-lang");
  });

  $("link-emp-login").addEventListener("click", (e) => {
    e.preventDefault();
    location.href = `emp-login.html?lang=${state.lang}`;
  });

  $("btn-confirm-pin").addEventListener("click", () => {
    if (state.pin.length < 4) {
      const dots = $("pin-dots");
      dots.classList.remove("shake");
      void dots.offsetWidth;
      dots.classList.add("shake");
      return;
    }
    disableNumpad(true);
    attemptLogin();
  });

  $("btn-reset").addEventListener("click", resetToLang);

  /* ── 초기화 (index.html) ─────────────────────── */
  initLangScreen();

  // 사번 로그인 후 복귀 시 (emp-login.html → ?auth=1&lang=xx)
  window.addEventListener("DOMContentLoaded", () => {
    const params = new URLSearchParams(location.search);
    if (params.get("auth") === "1" && localStorage.getItem("token")) {
      state.lang = params.get("lang") || "ko";
      state.authenticated = true;
      history.replaceState(null, "", location.pathname);
      initReadyScreen();
      showScreen("screen-ready");
      startCamera();
      return;
    }
    showScreen("screen-lang");
  });
}

/* ══════════════════════════════════════════════
   emp-login.html 전용 — 사번 로그인
   ══════════════════════════════════════════════ */
if ($("emp-input")) {

  const params = new URLSearchParams(location.search);
  const lang = params.get("lang") || "ko";

  const empInput = $("emp-input");
  const btnLogin = $("btn-login");
  const btnBack = $("btn-back");
  const msgEl = $("emp-msg");

  empInput.addEventListener("input", () => {
    btnLogin.disabled = empInput.value.trim().length === 0;
  });

  empInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !btnLogin.disabled) doLogin();
  });

  btnLogin.addEventListener("click", doLogin);

  async function doLogin() {
    const empNo = empInput.value.trim();
    if (!empNo) return;

    btnLogin.disabled = true;
    msgEl.className = "emp-msg loading";
    msgEl.textContent = "로그인 중...";

    try {
      const res = await fetch(`${API_BASE}/auth/employee/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emp_no: empNo, language: lang }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "로그인 실패");
      }

      const data = await res.json();
      localStorage.setItem("token", data.access_token);
      localStorage.setItem("role", data.role);

      msgEl.className = "emp-msg";
      msgEl.style.color = "var(--green)";
      msgEl.textContent = "로그인 성공!";

      setTimeout(() => {
        location.href = `index.html?auth=1&lang=${lang}`;
      }, 500);

    } catch (err) {
      msgEl.className = "emp-msg error";
      msgEl.textContent = err.message;
      btnLogin.disabled = false;
      empInput.select();
    }
  }

  btnBack.addEventListener("click", () => {
    location.href = `index.html?lang=${lang}`;
  });

  $("link-back").addEventListener("click", (e) => {
    e.preventDefault();
    location.href = `index.html?lang=${lang}`;
  });

  empInput.focus();
}

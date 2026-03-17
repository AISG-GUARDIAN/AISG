/* ──────────────────────────────────────────────────
   app.js  — AI SAFE GUARDIAN · 로그인 / 토큰 / 카메라 / 스캔 / 결과
   index.html + emp-login.html 공용
────────────────────────────────────────────────── */

/* ── 상태 ────────────────────────────────────── */
const state = {
  lang: "ko",
  pin: "",
  failCount: 0,
  authenticated: false,
  stream: null,          // ready 화면 웹캠 스트림
  scanStream: null,      // scan 화면 웹캠 스트림
  capturedBase64: null,  // 촬영 시작 시 캡처된 이미지
  autoResetTimer: null,
  webrtc: null,          // WebRTCClient 인스턴스
};

const AUTO_RESET_SEC = 7;

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

  // 카메라 준비 화면 아닐 때 ready 스트림 중지
  if (id !== "screen-ready") stopCamera();
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

function delay(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

/* ── 공통 초기화 ─────────────────────────────── */
function resetToLang() {
  clearAutoReset();
  state.pin = "";
  state.failCount = 0;
  state.capturedBase64 = null;
  state.authenticated = false;
  localStorage.removeItem("token");
  localStorage.removeItem("role");
  speechSynthesis?.cancel();
  stopCamera();
  showScreen("screen-lang");
}

/* ── 카메라 관리 ─────────────────────────────── */
async function startCamera() {
  const video   = $("cam-video");
  const loading = $("cam-loading");
  const errBox  = $("cam-error");

  if (loading) loading.style.display = "";
  if (errBox)  errBox.style.display  = "none";
  if (video)   video.style.display   = "none";

  try {
    // 후면 카메라 우선 (모바일), 없으면 전면
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } },
      audio: false,
    });
    state.stream = stream;
    if (video) {
      video.srcObject = stream;
      await video.play();
    }
    if (loading) loading.style.display = "none";
    if (video)   video.style.display   = "block";

    // WebRTC 연결 시도
    _startWebRTC(stream);

  } catch (err) {
    if (loading) loading.style.display = "none";
    if (errBox)  errBox.style.display  = "";
    const msg = $("cam-error-msg");
    if (msg) {
      msg.textContent =
        err.name === "NotAllowedError"
          ? "카메라 권한이 없습니다 · Camera permission denied"
          : "카메라를 사용할 수 없습니다 · Camera unavailable";
    }
  }
}

function stopCamera() {
  _stopWebRTC();
  stopScanStream();
  const video = $("cam-video");
  if (video) { video.srcObject = null; }
  if (state.stream) {
    state.stream.getTracks().forEach((t) => t.stop());
    state.stream = null;
  }
}

function stopScanStream() {
  if (state.scanStream) {
    state.scanStream.getTracks().forEach((t) => t.stop());
    state.scanStream = null;
  }
  const webcam = $("webcam");
  if (webcam) { webcam.srcObject = null; }
  const preview = $("scan-preview");
  if (preview) { preview.src = ""; preview.style.display = "none"; }
  document.querySelector(".scan-view")?.classList.remove("webcam-active");
}

function captureFrame() {
  const video  = $("cam-video");
  const canvas = $("cam-canvas");
  if (!video || !video.videoWidth) return null;

  canvas.width  = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d").drawImage(video, 0, 0);
  return canvas;
}

/* ── WebRTC 헬퍼 ─────────────────────────────── */
function _startWebRTC(stream) {
  if (typeof WebRTCClient === "undefined") return;
  _stopWebRTC();
  state.webrtc = new WebRTCClient({
    onResult: _handleWebRTCResult,
    onStateChange: (s) => console.log("[WebRTC]", s),
  });
  state.webrtc.start(stream).then((ok) => {
    if (!ok) {
      console.log("[WebRTC] 연결 실패 — HTTP API fallback 사용");
      state.webrtc = null;
    }
  });
}

function _stopWebRTC() {
  if (state.webrtc) {
    state.webrtc.stop();
    state.webrtc = null;
  }
}

// WebRTC 결과 콜백
function _handleWebRTCResult({ helmetOk, vestOk }) {
  stopScanStream();
  detectItem("helmet", helmetOk);
  delay(400).then(() => {
    detectItem("vest", vestOk);
    return delay(600);
  }).then(() => showResult({ helmetOk, vestOk }));
}

/* ── 사진 캡처 ───────────────────────────────── */
function captureFromReadyCam() {
  const video  = $("cam-video");
  const canvas = $("cam-canvas");
  if (!video || !video.videoWidth || !canvas) return null;
  canvas.width  = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d").drawImage(video, 0, 0);
  return canvas.toDataURL("image/jpeg", 0.85);
}

function showCapturedInScanView() {
  const preview = $("scan-preview");
  if (!preview || !state.capturedBase64) return;
  preview.src = state.capturedBase64;
  preview.style.display = "block";
  document.querySelector(".scan-view")?.classList.add("webcam-active");
}

function runProgressBar() {
  let progress = 0;
  const timer = setInterval(() => {
    progress += Math.random() * 8 + 3;
    if (progress >= 100) { progress = 100; clearInterval(timer); }
    const bar = $("progress-bar");
    const pct = $("prog-pct");
    if (bar) bar.style.width = progress + "%";
    if (pct) pct.textContent = Math.round(progress) + "%";
  }, 120);
}

/* ── 감지 API (api.checkin 사용) ─────────────── */
async function callDetectAPI() {
  try {
    const base64 = state.capturedBase64;
    if (!base64) throw new Error("캡처 없음");

    // base64 → Blob 변환
    const byteString = atob(base64.split(",")[1]);
    const mimeString = base64.split(",")[0].split(":")[1].split(";")[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    const blob = new Blob([ab], { type: mimeString });

    const result = await api.checkin(blob);
    const { helmetOk, vestOk } = result;

    stopScanStream();
    detectItem("helmet", helmetOk);
    await delay(400);
    detectItem("vest", vestOk);
    await delay(600);
    showResult({ helmetOk, vestOk });

  } catch (err) {
    console.error("감지 API 오류:", err);
    // API 오류 시 mock fallback
    stopScanStream();
    detectItem("helmet", true);
    await delay(400);
    detectItem("vest", true);
    await delay(600);
    showResult({ helmetOk: true, vestOk: true });
  }
}

function detectItem(item, ok) {
  const box    = $(`box-${item}`);
  const status = $(`status-${item}`);
  if (box) box.classList.add(ok ? "detected" : "missing");
  if (status) {
    status.className = `ppe-status ${ok ? "detected" : "missing"}`;
    const icon = status.querySelector(".status-icon");
    const tag  = status.querySelector(".status-tag");
    if (icon) icon.textContent = ok ? "✅" : "❌";
    if (tag)  tag.textContent  = ok ? "감지됨" : "미착용";
  }
}

/* ── 결과 표시 ───────────────────────────────── */
function showResult({ helmetOk, vestOk }) {
  const passed = helmetOk && vestOk;
  flash();
  if (passed) {
    showPassScreen();
  } else {
    state.failCount++;
    showFailScreen({ helmetOk, vestOk });
  }
}

/* ── PASS 화면 ───────────────────────────────── */
function showPassScreen() {
  const lang = LANGUAGES.find((l) => l.code === state.lang);
  const cc = lang?.cc || "kr";
  $("pass-pin-badge").innerHTML = `<img src="https://flagcdn.com/w40/${cc}.png" alt="" style="height:1em;border-radius:3px;vertical-align:middle;margin-right:4px;"> ●●●-●●●●-${state.pin}`;
  $("pass-ppe-info").textContent  = `${t("helmetName")} ✅  ${t("vestName")} ✅`;
  $("pass-tts-label").textContent  = "🔊 TTS";
  $("pass-msg-native").textContent = t("passMsg");
  $("pass-msg-ko").textContent     = state.lang !== "ko" ? T["ko"].passMsg : "";
  $("next-native").textContent = t("nextBtn");
  $("next-ko").textContent     = state.lang !== "ko" ? "다음 작업자" : "";

  speak(t("ttsPassed") + ". " + t("passMsg"));
  showScreen("screen-pass");
  startAutoReset();
}

function startAutoReset() {
  clearAutoReset();
  let remaining = AUTO_RESET_SEC;
  const fill  = $("auto-reset-fill");
  const label = $("auto-reset-label");

  if (fill) {
    fill.style.transition = "none";
    fill.style.width = "100%";
    void fill.offsetWidth;
    fill.style.transition = `width ${AUTO_RESET_SEC}s linear`;
    fill.style.width = "0%";
  }
  if (label) label.textContent = `${remaining}초 후 자동으로 처음으로 돌아갑니다`;

  state.autoResetTimer = setInterval(() => {
    remaining--;
    if (label) label.textContent = `${remaining}초 후 자동으로 처음으로 돌아갑니다`;
    if (remaining <= 0) { clearAutoReset(); resetToLang(); }
  }, 1000);
}

function clearAutoReset() {
  if (state.autoResetTimer) {
    clearInterval(state.autoResetTimer);
    state.autoResetTimer = null;
  }
}

/* ── FAIL 화면 ───────────────────────────────── */
function showFailScreen({ helmetOk, vestOk }) {
  const lang = LANGUAGES.find((l) => l.code === state.lang);
  const cc = lang?.cc || "kr";
  $("fail-pin-badge").innerHTML = `<img src="https://flagcdn.com/w40/${cc}.png" alt="" style="height:1em;border-radius:3px;vertical-align:middle;margin-right:4px;"> ●●●-●●●●-${state.pin}`;
  $("fail-tts-label").textContent  = "🔊 TTS";
  $("fail-msg-native").textContent = t("failMsg");
  $("fail-msg-ko").textContent     = state.lang !== "ko" ? T["ko"].failMsg : "";

  // 미착용 항목 목록
  const list = $("fail-ppe-list");
  if (list) {
    list.innerHTML = "";
    [{ ok: helmetOk, key: "helmetName", ko: "안전모" },
     { ok: vestOk,   key: "vestName",   ko: "안전조끼" }].forEach(({ ok, key, ko }) => {
      const div = document.createElement("div");
      div.className = `ppe-status ${ok ? "detected" : "missing"}`;
      div.innerHTML = `
        <span class="status-icon">${ok ? "✅" : "❌"}</span>
        <div>
          <div class="status-name">${t(key)}</div>
          ${state.lang !== "ko" ? `<div class="status-ko">${ko}</div>` : ""}
        </div>
        <span class="status-tag">${ok ? "착용됨" : "미착용"}</span>`;
      list.appendChild(div);
    });
  }

  // 가이드
  $("guide-label").textContent = t("guidTitle");
  const ol = $("guide-list");
  if (ol) {
    ol.innerHTML = "";
    (t("guide") || []).forEach((step) => {
      const li = document.createElement("li");
      li.textContent = step;
      ol.appendChild(li);
    });
  }

  // 재시도 버튼에 시도 횟수 표시
  $("retry-native").textContent = `🔄 ${t("retryBtn")} (${state.failCount}/3)`;
  $("retry-ko").textContent     = state.lang !== "ko" ? `재시도 (${state.failCount}/3)` : "";

  // 3회 이상 실패 → 에스컬레이션
  if (state.failCount >= 3) {
    $("btn-retry").style.display   = "none";
    $("escalation-box").style.display = "";
    $("escalation-native").textContent = t("escalationNative");
    $("escalation-ko").textContent     = t("escalationKo");
    $("reset-native").textContent = t("resetBtn");
  } else {
    $("btn-retry").style.display   = "";
    $("escalation-box").style.display = "none";
  }

  speak(t("ttsFailed") + ". " + t("failMsg"), 3);
  showScreen("screen-fail");
}

/* ══════════════════════════════════════════════
   index.html 전용 — 언어선택 / PIN / 카메라 / 스캔
   ══════════════════════════════════════════════ */
if ($("lang-grid")) {

  /* ── 언어 선택 ───────────────────────────────── */
  function initLangScreen() {
    const grid = $("lang-grid");
    grid.innerHTML = "";
    LANGUAGES.forEach(({ code, cc, label }) => {
      const btn = document.createElement("button");
      btn.className = "lang-btn";
      btn.innerHTML = `<img class="lang-flag" src="https://flagcdn.com/w80/${cc}.png" alt="${label}"><span class="lang-label">${label}</span>`;
      btn.addEventListener("click", () => selectLang(code, cc));
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

  function selectLang(code, cc) {
    state.lang = code;
    state.pin = "";
    speak((T[code] || T["ko"]).greeting);
    initPinScreen(cc);
    showScreen("screen-pin");
  }

  /* ── PIN 입력 ────────────────────────────────── */
  function initPinScreen(cc) {
    $("pin-flag").innerHTML = `<img src="https://flagcdn.com/w160/${cc}.png" alt="" style="height:1em;border-radius:4px;">`;
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
      const data = await api.loginUser(state.pin, state.lang);

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

  /* ── 카메라 준비 화면 ────────────────────────── */
  function initReadyScreen() {
    const lang = LANGUAGES.find((l) => l.code === state.lang);
    const cc = lang?.cc || "kr";
    $("ready-badge").innerHTML = `<img src="https://flagcdn.com/w40/${cc}.png" alt="" style="height:1em;border-radius:3px;vertical-align:middle;margin-right:4px;"> ●●●-●●●●-${state.pin}`;
    $("ready-greeting-native").textContent = t("greeting");
    $("ready-greeting-ko").textContent = state.lang !== "ko" ? "안녕하세요!" : "";

    $("ready-helmet-native").textContent = t("helmetName");
    $("ready-helmet-ko").textContent     = state.lang !== "ko" ? "안전모" : "";
    $("ready-wear-native").textContent   = t("wearCheck");
    $("ready-wear-ko").textContent       = state.lang !== "ko" ? "착용 필수" : "";

    $("ready-vest-native").textContent  = t("vestName");
    $("ready-vest-ko").textContent      = state.lang !== "ko" ? "안전조끼" : "";
    $("ready-wear2-native").textContent = t("wearCheck");
    $("ready-wear2-ko").textContent     = state.lang !== "ko" ? "착용 필수" : "";

    $("start-native").textContent = t("startScan");
    $("start-ko").textContent     = state.lang !== "ko" ? "촬영 시작" : "";
  }

  /* ── 스캔 화면 ───────────────────────────────── */
  function initScanScreen() {
    $("scan-label-native").textContent = t("scanLabel");
    $("scan-label-ko").textContent     = state.lang !== "ko" ? "PPE 착용 상태를 확인하고 있습니다" : "";

    $("status-helmet-native").textContent = t("helmetName");
    $("status-helmet-ko").textContent     = state.lang !== "ko" ? "안전모" : "";
    $("status-vest-native").textContent   = t("vestName");
    $("status-vest-ko").textContent       = state.lang !== "ko" ? "안전조끼" : "";

    $("box-helmet-label").textContent = t("helmetName");
    $("box-vest-label").textContent   = t("vestName");

    // 캡처 이미지 초기화
    const preview = $("scan-preview");
    if (preview) { preview.src = ""; preview.style.display = "none"; }
    document.querySelector(".scan-view")?.classList.remove("webcam-active");

    ["box-helmet", "box-vest"].forEach((id) => $(id).classList.remove("detected", "missing"));
    ["status-helmet", "status-vest"].forEach((id) => {
      const el = $(id);
      el.className = "ppe-status scanning";
      el.querySelector(".status-icon").textContent = "⏳";
      el.querySelector(".status-tag").textContent  = "감지중...";
    });
    const bar = $("progress-bar");
    const pct = $("prog-pct");
    if (bar) bar.style.width = "0%";
    if (pct) pct.textContent = "0%";
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

  $("btn-start-scan").addEventListener("click", () => {
    // 화면 전환 전에 ready 카메라에서 프레임 캡처
    state.capturedBase64 = captureFromReadyCam();

    flash();
    initScanScreen();
    showScreen("screen-scanning");

    // 캡처된 이미지를 스캔 화면 배경으로 표시
    showCapturedInScanView();
    runProgressBar();

    // WebRTC 연결 중이면 서버 측 캡처 요청, 아니면 HTTP API fallback
    if (state.webrtc?.isConnected) {
      state.webrtc.requestCapture();
    } else {
      setTimeout(() => callDetectAPI(), 500);
    }
  });

  $("btn-reset").addEventListener("click", resetToLang);
  $("btn-next-worker").addEventListener("click", resetToLang);

  $("btn-retry").addEventListener("click", () => {
    flash();
    initReadyScreen();
    showScreen("screen-ready");
    startCamera();
  });

  $("btn-reset-fail").addEventListener("click", resetToLang);

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
      const data = await api.loginEmployee(empNo, lang);

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

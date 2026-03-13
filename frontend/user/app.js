/* ──────────────────────────────────────────────────
   app.js  — AI SAFE GUARDIAN · Worker Check-In
   화면 전환 / PIN / 카메라 / 스캔 / TTS / API
────────────────────────────────────────────────── */

/* ── 상태 ────────────────────────────────────── */
const state = {
  lang: "ko",
  pin: "",
  failCount: 0,
  stream: null,        // MediaStream
  capturedBlob: null,  // 캡처 이미지
  autoResetTimer: null,
};

const AUTO_RESET_SEC = 7; // PASS 후 자동 초기화 시간(초)
const API_BASE = "";       // 백엔드 동일 origin

/* ── 유틸 ────────────────────────────────────── */
const $ = (id) => document.getElementById(id);

const SCREEN_BODY_CLASS = {
  "screen-lang":     "screen-lang",
  "screen-pin":      "screen-pin",
  "screen-ready":    "screen-ready",
  "screen-scanning": "screen-scanning",
  "screen-pass":     "screen-pass",
  "screen-fail":     "screen-fail",
};

function showScreen(id) {
  document.querySelectorAll(".screen").forEach((s) =>
    s.classList.remove("active", "fade-in")
  );
  const el = $(id);
  el.classList.add("active", "fade-in");
  $("btn-reset").style.display = id === "screen-lang" ? "none" : "";

  // body 클래스로 화면별 테마 적용
  document.body.className = SCREEN_BODY_CLASS[id] || "";

  // 카메라 준비 화면 아닐 때 스트림 중지
  if (id !== "screen-ready") stopCamera();
}

function flash() {
  const o = $("flash-overlay");
  o.classList.remove("flash");
  void o.offsetWidth;
  o.classList.add("flash");
}

function speak(text, repeat = 1) {
  if (!window.speechSynthesis) return;
  speechSynthesis.cancel();
  const langMap = {
    ko:"ko-KR", en:"en-US", zh:"zh-CN", vi:"vi-VN",
    th:"th-TH", km:"km-KH", mn:"mn-MN", ru:"ru-RU", id:"id-ID",
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
  // 3열 기준으로 마지막 행 빈 칸 채우기
  const remainder = LANGUAGES.length % 3;
  if (remainder !== 0) {
    const empty = 3 - remainder;
    for (let i = 0; i < empty; i++) {
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
  ["1","2","3","4","5","6","7","8","9","","0","⌫"].forEach((k) => {
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

  // 4자리 완성 → 400ms 후 자동 진행
  if (state.pin.length === 4) {
    setTimeout(() => {
      initReadyScreen();
      showScreen("screen-ready");
      startCamera();
    }, 400);
  }
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

$("btn-back-pin").addEventListener("click", () => {
  state.pin = "";
  showScreen("screen-lang");
});

$("btn-confirm-pin").addEventListener("click", () => {
  if (state.pin.length < 4) {
    // shake 애니메이션
    const dots = $("pin-dots");
    dots.classList.remove("shake");
    void dots.offsetWidth;
    dots.classList.add("shake");
    return;
  }
  initReadyScreen();
  showScreen("screen-ready");
  startCamera();
});

/* ── 카메라 관리 ─────────────────────────────── */
async function startCamera() {
  const video   = $("cam-video");
  const loading = $("cam-loading");
  const errBox  = $("cam-error");

  loading.style.display = "";
  errBox.style.display  = "none";
  video.style.display   = "none";

  try {
    // 후면 카메라 우선 (모바일), 없으면 전면
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } },
      audio: false,
    });
    state.stream = stream;
    video.srcObject = stream;
    await video.play();
    loading.style.display = "none";
    video.style.display   = "block";
  } catch (err) {
    loading.style.display = "none";
    errBox.style.display  = "";
    $("cam-error-msg").textContent =
      err.name === "NotAllowedError"
        ? "카메라 권한이 없습니다 · Camera permission denied"
        : "카메라를 사용할 수 없습니다 · Camera unavailable";
  }
}

function stopCamera() {
  if (state.stream) {
    state.stream.getTracks().forEach((t) => t.stop());
    state.stream = null;
  }
}

function captureFrame() {
  const video  = $("cam-video");
  const canvas = $("cam-canvas");
  if (!video || !video.videoWidth) return null;

  canvas.width  = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d").drawImage(video, 0, 0);
  return canvas; // caller calls canvas.toBlob(...)
}

/* ── 카메라 준비 화면 ────────────────────────── */
function initReadyScreen() {
  const lang = LANGUAGES.find((l) => l.code === state.lang);
  $("ready-badge").textContent = `${lang?.flag || ""} ●●●-●●●●-${state.pin}`;
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

$("btn-start-scan").addEventListener("click", () => {
  // 카메라 프레임 캡처
  const canvas = captureFrame();
  if (!canvas) {
    // 카메라 없으면 mock으로 진행
    state.capturedBlob = null;
    proceedToScan();
    return;
  }
  canvas.toBlob((blob) => {
    state.capturedBlob = blob;
    flash();
    proceedToScan();
  }, "image/jpeg", 0.92);
});

function proceedToScan() {
  initScanScreen();
  showScreen("screen-scanning"); // stopCamera 호출됨
  runScanWithAPI();
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

  ["box-helmet","box-vest"].forEach((id) => $(id).classList.remove("detected","missing"));
  ["status-helmet","status-vest"].forEach((id) => {
    const el = $(id);
    el.className = "ppe-status scanning";
    el.querySelector(".status-icon").textContent = "⏳";
    el.querySelector(".status-tag").textContent  = "감지중...";
  });
  $("progress-bar").style.width = "0%";
  $("prog-pct").textContent = "0%";
}

async function runScanWithAPI() {
  // 진행바 애니메이션 (API 응답 기다리는 동안)
  let progress = 0;
  const timer = setInterval(() => {
    progress = Math.min(progress + Math.random() * 6 + 2, 90); // API 전엔 90%까지만
    $("progress-bar").style.width = progress + "%";
    $("prog-pct").textContent = Math.round(progress) + "%";
  }, 120);

  try {
    let result;
    if (state.capturedBlob) {
      // 실제 API 호출
      result = await callCheckinAPI(state.capturedBlob);
    } else {
      // 카메라 없음 → mock
      await delay(2500);
      result = { helmetOk: true, vestOk: true };
    }

    clearInterval(timer);
    $("progress-bar").style.width = "100%";
    $("prog-pct").textContent = "100%";

    // 감지 결과 박스 표시
    detectItem("helmet", result.helmetOk ?? true);
    await delay(400);
    detectItem("vest", result.vestOk ?? true);
    await delay(600);

    showResult(result);
  } catch (err) {
    clearInterval(timer);
    console.error("API 오류:", err);
    // API 실패 시 mock 결과
    detectItem("helmet", true);
    await delay(400);
    detectItem("vest", true);
    await delay(600);
    showResult({ helmetOk: true, vestOk: true });
  }
}

function delay(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

function detectItem(item, ok) {
  const box    = $(`box-${item}`);
  const status = $(`status-${item}`);
  box.classList.add(ok ? "detected" : "missing");
  status.className = `ppe-status ${ok ? "detected" : "missing"}`;
  status.querySelector(".status-icon").textContent = ok ? "✅" : "❌";
  status.querySelector(".status-tag").textContent  = ok ? "감지됨" : "미착용";
}

/* ── API 호출 ────────────────────────────────── */
async function callCheckinAPI(imageBlob) {
  const token = localStorage.getItem("token");
  const form  = new FormData();
  form.append("file", imageBlob, "capture.jpg");

  const res = await fetch(`${API_BASE}/user/checkin`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const data = await res.json();
  // 백엔드 응답 → helmetOk / vestOk 로 변환
  return {
    helmetOk: data.passed ?? data.helmetOk ?? true,
    vestOk:   data.vestOk ?? data.passed ?? true,
    raw:      data,
  };
}

/* ── 결과 표시 ───────────────────────────────── */
function showResult({ helmetOk, vestOk }) {
  const passed = helmetOk && vestOk;
  flash();
  if (passed) {
    showPassScreen({ helmetOk, vestOk });
  } else {
    state.failCount++;
    showFailScreen({ helmetOk, vestOk });
  }
}

/* ── PASS 화면 ───────────────────────────────── */
function showPassScreen({ helmetOk, vestOk }) {
  const lang = LANGUAGES.find((l) => l.code === state.lang);
  $("pass-pin-badge").textContent = `${lang?.flag || ""} ●●●-●●●●-${state.pin}`;
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

  fill.style.transition = "none";
  fill.style.width = "100%";
  void fill.offsetWidth;
  fill.style.transition = `width ${AUTO_RESET_SEC}s linear`;
  fill.style.width = "0%";

  label.textContent = `${remaining}초 후 자동으로 처음으로 돌아갑니다`;

  state.autoResetTimer = setInterval(() => {
    remaining--;
    label.textContent = `${remaining}초 후 자동으로 처음으로 돌아갑니다`;
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
  $("fail-pin-badge").textContent = `${lang?.flag || ""} ●●●-●●●●-${state.pin}`;
  $("fail-tts-label").textContent  = "🔊 TTS";
  $("fail-msg-native").textContent = t("failMsg");
  $("fail-msg-ko").textContent     = state.lang !== "ko" ? T["ko"].failMsg : "";

  // 미착용 항목 목록
  const list = $("fail-ppe-list");
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

  // 가이드
  $("guide-label").textContent = t("guidTitle");
  const ol = $("guide-list");
  ol.innerHTML = "";
  (t("guide") || []).forEach((step) => {
    const li = document.createElement("li");
    li.textContent = step;
    ol.appendChild(li);
  });

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

/* ── 공통 초기화 ─────────────────────────────── */
function resetToLang() {
  clearAutoReset();
  state.pin = "";
  state.failCount = 0;
  state.capturedBlob = null;
  speechSynthesis?.cancel();
  stopCamera();
  showScreen("screen-lang");
}

/* ── 버튼 이벤트 ─────────────────────────────── */
$("btn-reset").addEventListener("click", resetToLang);

$("btn-next-worker").addEventListener("click", resetToLang);

$("btn-retry").addEventListener("click", () => {
  // 카메라 다시 시작 → 준비 화면으로
  initReadyScreen();
  showScreen("screen-ready");
  startCamera();
});

$("btn-reset-fail").addEventListener("click", resetToLang);

/* ── 초기화 ──────────────────────────────────── */
initLangScreen();
showScreen("screen-lang");

/* ──────────────────────────────────────────────────
   app.js  — AI SAFE GUARDIAN · Worker Check-In
   화면 전환 / PIN / 카메라 / 스캔 / TTS / API
────────────────────────────────────────────────── */

/* ── 상태 ────────────────────────────────────── */
const state = {
  lang: "ko",
  pin: "",
  failCount: 0,
  stream: null,          // ready 화면 웹캠 스트림
  capturedBase64: null,  // 촬영 시작 시 캡처된 이미지
  autoResetTimer: null,
  webrtc: null,          // WebRTCClient 인스턴스 (연결 시)
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

  // 카메라 준비 화면 아닐 때 ready 스트림 중지 (scan 스트림은 callDetectAPI 내부에서 정리)
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
  LANGUAGES.forEach(({ code, cc, label }) => {
    const btn = document.createElement("button");
    btn.className = "lang-btn";
    btn.innerHTML = `<img class="lang-flag" src="https://flagcdn.com/w80/${cc}.png" alt="${label}"><span class="lang-label">${label}</span>`;
    btn.addEventListener("click", () => selectLang(code, cc));
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

    // WebRTC 연결 시도 (백엔드 /ws/signal 준비 시 자동 활성화)
    _startWebRTC(stream);

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
  return canvas; // caller calls canvas.toBlob(...)
}

/* ── 카메라 준비 화면 ────────────────────────── */
function initReadyScreen() {
  const lang = LANGUAGES.find((l) => l.code === state.lang);
  $("ready-badge").innerHTML = `<img src="https://flagcdn.com/w40/${lang?.cc || "kr"}.png" alt="" style="height:1em;border-radius:3px;vertical-align:middle;margin-right:4px;"> ●●●-●●●●-${state.pin}`;
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
  // 화면 전환 전에 ready 카메라에서 프레임 캡처 (미리보기 + HTTP fallback용)
  state.capturedBase64 = captureFromReadyCam();

  flash();
  initScanScreen();
  showScreen("screen-scanning"); // ready 카메라 종료됨

  // 캡처된 이미지를 스캔 화면 배경으로 표시
  showCapturedInScanView();
  runProgressBar();

  // WebRTC 연결 중이면 서버 측 캡처 요청, 아니면 HTTP API fallback
  if (state.webrtc?.isConnected) {
    state.webrtc.requestCapture();
    // 결과는 onResult 콜백 → _handleWebRTCResult() 에서 처리
  } else {
    setTimeout(() => callDetectAPI(), 500);
  }
});

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

/* ── WebRTC 헬퍼 ─────────────────────────────── */
function _startWebRTC(stream) {
  if (typeof WebRTCClient === "undefined") return; // webrtc.js 미로드 시 무시
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

// WebRTC 결과 콜백: 서버가 DataChannel / WebSocket으로 감지 결과 전송 시 호출
function _handleWebRTCResult({ helmetOk, vestOk }) {
  stopScanStream();
  detectItem("helmet", helmetOk);
  delay(400).then(() => {
    detectItem("vest", vestOk);
    return delay(600);
  }).then(() => showResult({ helmetOk, vestOk }));
}

/* ── 사진 캡처 ───────────────────────────────── */
// ready 화면 카메라에서 현재 프레임 → base64
function captureFromReadyCam() {
  const video  = $("cam-video");
  const canvas = $("cam-canvas");
  if (!video || !video.videoWidth || !canvas) return null;
  canvas.width  = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d").drawImage(video, 0, 0);
  return canvas.toDataURL("image/jpeg", 0.85);
}

// 스캔 화면 배경에 캡처 이미지 표시
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
    $("progress-bar").style.width = progress + "%";
    $("prog-pct").textContent = Math.round(progress) + "%";
  }, 120);
}

async function callDetectAPI() {
  try {
    const base64 = state.capturedBase64;
    if (!base64) throw new Error("캡처 없음 — mock으로 진행");

    const res = await fetch(`${API_BASE}/api/detect/mock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: base64, timestamp: Date.now() }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    // detections 배열 형식 (Azure Custom Vision 호환)
    let helmetOk, vestOk;
    if (Array.isArray(data.detections)) {
      helmetOk = data.detections.some((d) => d.tag === "helmet"       && d.probability >= 0.7);
      vestOk   = data.detections.some((d) => d.tag === "safety_vest"  && d.probability >= 0.7);
    } else {
      // 직접 helmetOk/vestOk 응답도 지원
      helmetOk = data.helmetOk ?? data.passed ?? true;
      vestOk   = data.vestOk   ?? data.passed ?? true;
    }

    stopScanStream();
    detectItem("helmet", helmetOk);
    await delay(400);
    detectItem("vest", vestOk);
    await delay(600);
    showResult({ helmetOk, vestOk });

  } catch (err) {
    console.error("감지 API 오류:", err);
    stopScanStream();
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
    showPassScreen();
  } else {
    state.failCount++;
    showFailScreen({ helmetOk, vestOk });
  }
}

/* ── PASS 화면 ───────────────────────────────── */
function showPassScreen() {
  const lang = LANGUAGES.find((l) => l.code === state.lang);
  $("pass-pin-badge").innerHTML = `<img src="https://flagcdn.com/w40/${lang?.cc || "kr"}.png" alt="" style="height:1em;border-radius:3px;vertical-align:middle;margin-right:4px;"> ●●●-●●●●-${state.pin}`;
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
  $("fail-pin-badge").innerHTML = `<img src="https://flagcdn.com/w40/${lang?.cc || "kr"}.png" alt="" style="height:1em;border-radius:3px;vertical-align:middle;margin-right:4px;"> ●●●-●●●●-${state.pin}`;
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
  state.capturedBase64 = null;
  speechSynthesis?.cancel();
  stopCamera();
  showScreen("screen-lang");
}

/* ── 버튼 이벤트 ─────────────────────────────── */
$("btn-reset").addEventListener("click", resetToLang);

$("btn-next-worker").addEventListener("click", resetToLang);

$("btn-retry").addEventListener("click", () => {
  flash();
  showScreen("screen-ready");
  startCamera();
});

$("btn-reset-fail").addEventListener("click", resetToLang);

/* ── 초기화 ──────────────────────────────────── */
initLangScreen();
showScreen("screen-lang");

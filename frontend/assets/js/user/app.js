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

  // 화면 전환 시 이전 TTS 즉시 중단
  speechSynthesis?.cancel();

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

  // 카메라가 필요 없는 화면에서만 스트림 중지
  // ready/scanning/fail 화면에서는 카메라 유지 (재시도 시 스트림 재사용)
  const keepCamera = new Set(["screen-ready", "screen-scanning", "screen-fail"]);
  if (!keepCamera.has(id)) stopCamera();
}

function flash() {
  const o = $("flash-overlay");
  if (!o) return;
  o.classList.remove("flash");
  void o.offsetWidth;
  o.classList.add("flash");
}

// TTS 미지원 언어(th/km)는 영어 텍스트 + en-US 음성으로 대체
const TTS_FALLBACK = new Set(["th", "km"]);

// 모바일/태블릿에서 speechSynthesis는 사용자 제스처 컨텍스트 안에서만 동작한다.
// 첫 터치 시 빈 utterance를 발화하여 TTS 엔진을 unlock 해둔다.
let _ttsUnlocked = false;
function _unlockTTS() {
  if (_ttsUnlocked || !window.speechSynthesis) return;
  const u = new SpeechSynthesisUtterance("");
  u.volume = 0;
  speechSynthesis.speak(u);
  _ttsUnlocked = true;
}
document.addEventListener("click", _unlockTTS, { once: true });
document.addEventListener("touchstart", _unlockTTS, { once: true });

function speak(text, repeat = 1) {
  if (!window.speechSynthesis) return;
  speechSynthesis.cancel();
  const langMap = {
    ko: "ko-KR", en: "en-US", zh: "zh-CN", vi: "vi-VN",
    th: "en-US", km: "en-US",
  };
  // Chrome에서 cancel() 직후 speak()하면 무시되는 버그 대응
  setTimeout(() => {
    let count = 0;
    function fire() {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = langMap[state.lang] || "ko-KR";
      u.rate = 0.95;
      u.onend = () => { count++; if (count < repeat) fire(); };
      speechSynthesis.speak(u);
    }
    fire();
  }, 60);
}

/** 화면 표시용 — 현재 언어의 텍스트 반환 */
function t(key) {
  return (T[state.lang] || T["ko"])[key] || "";
}

/** TTS용 — th/km이면 영어 텍스트 반환, 나머지는 네이티브 */
function tt(key) {
  const lang = TTS_FALLBACK.has(state.lang) ? "en" : state.lang;
  return (T[lang] || T["ko"])[key] || "";
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

// 현재 카메라 방향 — "environment"(후면) 또는 "user"(전면)
let cameraFacing = "environment";

/** 전면/후면 카메라를 전환한다. */
async function toggleCamera() {
  cameraFacing = cameraFacing === "environment" ? "user" : "environment";
  // 기존 스트림 정리 후 재시작
  stopCamera();
  await startCamera();
}

async function startCamera() {
  const video   = $("cam-video");
  const loading = $("cam-loading");
  const errBox  = $("cam-error");

  if (loading) loading.style.display = "";
  if (errBox)  errBox.style.display  = "none";
  if (video)   video.style.display   = "none";

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: cameraFacing }, width: { ideal: 1280 } },
      audio: false,
    });
    state.stream = stream;
    if (video) {
      video.srcObject = stream;
      await video.play();
    }
    if (loading) loading.style.display = "none";
    if (video)   video.style.display   = "block";

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
  if (typeof FaceGuide !== "undefined") FaceGuide.stopLoop();
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

    // BASE64 문자열을 그대로 JSON으로 전송 (Blob 변환 불필요)
    _updateProgressLabel("서버 분석 중...");
    const result = await api.checkin(base64);

    // retry — Face API에서 정면 아님 판정 → MediaPipe 루프 재시작
    if (result.status === "retry") {
      const reason = result.message || "";
      // 얼굴 2개 이상 감지 시 별도 안내
      if (reason.includes("2개 이상")) {
        _updateProgressLabel("다시 촬영합니다");
        speak(t("multiFaceWarn"));
        _updateFaceGuide("multi_face");
      } else {
        _updateProgressLabel("정면 재확인 필요");
        speak(reason || tt("scanMessage"));
        _updateFaceGuide("not_frontal");
      }
      // 스캔 화면 유지, 웹캠 다시 표시 + MediaPipe 루프 재시작
      const webcam = $("webcam");
      const canvas = $("captureCanvas");
      const preview = $("scan-preview");
      if (preview) { preview.style.display = "none"; }
      if (webcam && state.stream) {
        webcam.srcObject = state.stream;
        await webcam.play().catch(() => {});
      }
      FaceGuide.startLoop(webcam, canvas,
        (base64) => {
          _updateFaceGuide("captured");
          flash();
          state.capturedBase64 = base64;
          showCapturedInScanView();
          _updateProgressLabel("서버 분석 중...");
          callDetectAPI();
        },
        (status) => { _updateFaceGuide(status); }
      );
      return;
    }

    // 서버 응답의 attempt_count로 프론트 failCount 동기화
    state.failCount = result.attempt;

    const { helmetOk, vestOk } = result;

    _updateProgressLabel("판정 완료");
    stopScanStream();
    detectItem("helmet", helmetOk);
    await delay(400);
    detectItem("vest", vestOk);
    await delay(600);
    showResult({ helmetOk, vestOk, needsAdmin: result.needsAdmin });

  } catch (err) {
    console.error("감지 API 오류:", err);
    stopScanStream();
    // API 오류 시 카메라 화면으로 복귀 (mock fallback 제거)
    speak("서버 오류가 발생했습니다. 다시 시도해 주세요.");
    initReadyScreen();
    showScreen("screen-ready");
    startCamera();
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
function showResult({ helmetOk, vestOk, needsAdmin }) {
  const passed = helmetOk && vestOk;
  flash();
  if (passed) {
    showPassScreen();
  } else {
    // failCount는 callDetectAPI()에서 서버 attempt_count로 동기화됨
    showFailScreen({ helmetOk, vestOk, needsAdmin });
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

  showScreen("screen-pass");
  speak(tt("ttsPassed") + ". " + tt("passMsg"));
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
function showFailScreen({ helmetOk, vestOk, needsAdmin }) {
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

  // 서버에서 3회 실패 판정 시 에스컬레이션
  if (needsAdmin) {
    $("btn-retry").style.display   = "none";
    $("escalation-box").style.display = "";
    $("escalation-native").textContent = t("escalationNative");
    $("escalation-ko").textContent     = t("escalationKo");
    $("reset-native").textContent = t("resetBtn");
  } else {
    $("btn-retry").style.display   = "";
    $("escalation-box").style.display = "none";
  }

  showScreen("screen-fail");
  // 실패 시 1회만 재생, 에스컬레이션이면 관리자 호출 메시지 TTS
  if (needsAdmin) {
    speak(tt("escalationNative"));
  } else {
    speak(tt("ttsFailed") + ". " + tt("failMsg"));
  }
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
    initPinScreen(cc);
    // 선택 언어에 맞춰 사번 로그인 링크 텍스트 갱신
    const empLink = $("link-emp-login");
    if (empLink) empLink.textContent = t("empPinPrompt");
    showScreen("screen-pin");
    // greeting 재생 후 pinPrompt 순서대로 TTS (showScreen 이후 호출)
    // th/km은 영어 텍스트로 대체
    const ttsLang = TTS_FALLBACK.has(code) ? T["en"] : (T[code] || T["ko"]);
    if (window.speechSynthesis) {
      const langMap = {
        ko: "ko-KR", en: "en-US", zh: "zh-CN", vi: "vi-VN",
        th: "en-US", km: "en-US",
      };
      const ttsCode = langMap[code] || "ko-KR";
      const uGreeting = new SpeechSynthesisUtterance(ttsLang.greeting);
      uGreeting.lang = ttsCode;
      uGreeting.rate = 0.95;
      uGreeting.onend = () => {
        const uPin = new SpeechSynthesisUtterance(ttsLang.pinPrompt);
        uPin.lang = ttsCode;
        uPin.rate = 0.95;
        speechSynthesis.speak(uPin);
      };
      speechSynthesis.speak(uGreeting);
    }
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
      // 로그인 직후 착용 확인 안내 TTS
      speak(tt("checkMessage"));
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
    $("scan-label-ko").textContent     = state.lang !== "ko" ? "착용 상태를 확인하고 있습니다." : "";

    $("status-helmet-native").textContent = t("helmetName");
    $("status-helmet-ko").textContent     = state.lang !== "ko" ? "안전모" : "";
    $("status-vest-native").textContent   = t("vestName");
    $("status-vest-ko").textContent       = state.lang !== "ko" ? "안전조끼" : "";

    // 캡처 이미지 초기화
    const preview = $("scan-preview");
    if (preview) { preview.src = ""; preview.style.display = "none"; }
    document.querySelector(".scan-view")?.classList.remove("webcam-active");

    // 가이드 프레임 초기화
    const guide = $("body-guide");
    if (guide) {
      guide.className = "body-guide guide-no-face";
      const lbl = guide.querySelector(".body-guide-label");
      if (lbl) lbl.textContent = "상반신을 프레임 안에 맞춰주세요";
    }
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
    flash();
    initScanScreen();
    showScreen("screen-scanning");
    // 스캔 시작 시 자세 안내 TTS
    speak(tt("scanMessage"));

    // 스캔 화면 웹캠 시작 + MediaPipe 정면 감지 → 자동 캡처 → API 호출
    _startScanWithFaceGuide();
  });

  /** 스캔 화면에서 웹캠 + MediaPipe 정면 자동 캡처 시작 */
  async function _startScanWithFaceGuide() {
    const webcam = $("webcam");
    const canvas = $("captureCanvas");

    // 기존 ready 카메라 스트림을 스캔 화면 webcam에 연결
    if (state.stream) {
      webcam.srcObject = state.stream;
      await webcam.play().catch(() => {});
      document.querySelector(".scan-view")?.classList.add("webcam-active");
    }

    // MediaPipe 초기화 완료 대기 (CDN 로딩이 느릴 수 있음)
    if (typeof FaceGuide !== "undefined" && !FaceGuide.isReady()) {
      _updateFaceGuide("no_face");
      _updateProgressLabel("얼굴 감지 준비 중...");
      await FaceGuide.init();
    }

    // 얼굴 가이드 초기 상태
    _updateFaceGuide("no_face");

    // MediaPipe 정면 감지 루프 — 상태 콜백 + 정면 시 자동 캡처
    FaceGuide.startLoop(webcam, canvas,
      // onCapture
      (base64) => {
        _updateFaceGuide("captured");
        flash();
        state.capturedBase64 = base64;
        showCapturedInScanView();
        _updateProgressLabel("얼굴 확인 중...");
        runProgressBar();
        callDetectAPI();
      },
      // onStatus
      (status) => {
        _updateFaceGuide(status);
      }
    );
  }

  /** 얼굴 감지 가이드 메시지 + 가이드 프레임 업데이트 */
  function _updateFaceGuide(status) {
    const el = $("face-guide-msg");
    const label = $("prog-label");
    const guide = $("body-guide");
    const guideLbl = guide?.querySelector(".body-guide-label");

    // 하단 텍스트 메시지
    if (el) el.className = "face-guide-msg";
    // 가이드 프레임 상태 초기화
    if (guide) guide.className = "body-guide";

    switch (status) {
      case "no_face":
        if (el) { el.textContent = "카메라를 봐주세요"; el.classList.add("guide-error"); }
        if (guide) guide.classList.add("guide-no-face");
        if (guideLbl) guideLbl.textContent = "프레임 안에 상반신을 맞춰주세요";
        if (label) label.textContent = "얼굴 감지 대기";
        break;
      case "too_close":
        if (el) { el.textContent = "뒤로 물러나 상반신이 보이게 해주세요"; el.classList.add("guide-warn"); }
        if (guide) guide.classList.add("guide-warn");
        if (guideLbl) guideLbl.textContent = "뒤로 물러나주세요";
        if (label) label.textContent = "상반신 확인 중";
        break;
      case "not_frontal":
        if (el) { el.textContent = "정면을 봐주세요"; el.classList.add("guide-warn"); }
        if (guide) guide.classList.add("guide-warn");
        if (guideLbl) guideLbl.textContent = "정면을 봐주세요";
        if (label) label.textContent = "정면 확인 중";
        break;
      case "multi_face":
        if (el) { el.textContent = t("multiFaceWarn"); el.classList.add("guide-warn"); }
        if (guide) guide.classList.add("guide-warn");
        if (guideLbl) guideLbl.textContent = "한 명만 촬영해주세요";
        if (label) label.textContent = "다시 촬영합니다";
        break;
      case "frontal":
        if (el) { el.textContent = "정면 확인!"; el.classList.add("guide-ok"); }
        if (guide) guide.classList.add("guide-ok");
        if (guideLbl) guideLbl.textContent = "촬영 중...";
        break;
      case "captured":
        if (el) { el.textContent = "촬영 완료 — 분석 중..."; el.classList.add("guide-ok"); }
        if (guide) guide.classList.add("guide-ok");
        if (guideLbl) guideLbl.textContent = "분석 중...";
        break;
    }
  }

  /** 프로그레스 라벨 텍스트 변경 */
  function _updateProgressLabel(text) {
    const label = $("prog-label");
    if (label) label.textContent = text;
  }

  $("btn-reset").addEventListener("click", resetToLang);
  $("btn-next-worker").addEventListener("click", resetToLang);

  $("btn-retry").addEventListener("click", async () => {
    flash();
    // 스트림이 죽었으면 카메라 재시작
    if (!state.stream || !state.stream.active) {
      await startCamera();
    }
    initScanScreen();
    showScreen("screen-scanning");
    _startScanWithFaceGuide();
  });

  $("btn-reset-fail").addEventListener("click", resetToLang);

  /* ── 초기화 (index.html) ─────────────────────── */
  // MediaPipe FaceDetector 사전 로드 (비동기, 로그인 전에 미리 준비)
  if (typeof FaceGuide !== "undefined") FaceGuide.init();

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
      // 사번 로그인 복귀 시에도 착용 확인 안내 TTS
      speak(tt("checkMessage"));
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

  // 숫자만 허용 — 문자 입력 필터링
  empInput.addEventListener("input", () => {
    empInput.value = empInput.value.replace(/[^0-9]/g, "");
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

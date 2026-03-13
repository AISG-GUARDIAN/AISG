/* ──────────────────────────────────────────────────
   app.js  — AI SAFE GUARDIAN · Worker Check-In
   화면 전환 / PIN 입력 / 스캔 애니메이션 / TTS / API
────────────────────────────────────────────────── */

/* ── 상태 ────────────────────────────────────── */
const state = {
  lang: "ko",
  pin: "",
  failCount: 0,
};

/* ── 유틸 ────────────────────────────────────── */
const $ = (id) => document.getElementById(id);

function showScreen(id) {
  document.querySelectorAll(".screen").forEach((s) => {
    s.classList.remove("active", "fade-in");
  });
  const el = $(id);
  el.classList.add("active", "fade-in");
  $("btn-reset").style.display = id === "screen-lang" ? "none" : "";
}

function flash() {
  const overlay = $("flash-overlay");
  overlay.classList.remove("flash");
  void overlay.offsetWidth; // reflow
  overlay.classList.add("flash");
}

function speak(text, lang) {
  if (!window.speechSynthesis) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang || state.lang;
  u.rate = 0.95;
  speechSynthesis.speak(u);
}

function t(key) {
  return (T[state.lang] || T["ko"])[key] || "";
}

/* ── 언어 선택 화면 ──────────────────────────── */
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
}

function selectLang(code, flag) {
  state.lang = code;
  state.pin = "";
  initPinScreen(flag);
  showScreen("screen-pin");
}

/* ── PIN 입력 화면 ───────────────────────────── */
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
  const keys = ["1","2","3","4","5","6","7","8","9","","0","⌫"];
  keys.forEach((k) => {
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
  if (k === "⌫") {
    state.pin = state.pin.slice(0, -1);
  } else if (state.pin.length < 4) {
    state.pin += k;
  }
  updatePinDisplay();
}

function updatePinDisplay() {
  const len = state.pin.length;
  for (let i = 0; i < 4; i++) {
    const d = $(`dot-${i}`);
    if (d) d.classList.toggle("filled", i < len);
  }
  // 마스킹 표시
  const display = $("pin-display");
  display.textContent = state.pin.padEnd(4, "○").replace(/\d/g, "●").replace(/○/g, "○");

  const btn = $("btn-confirm-pin");
  if (len === 4) {
    btn.disabled = false;
    btn.textContent = "확인 →";
  } else {
    btn.disabled = true;
    btn.textContent = `${len} / 4 자리 입력 중`;
  }
}

$("btn-back-pin").addEventListener("click", () => {
  state.pin = "";
  showScreen("screen-lang");
});

$("btn-confirm-pin").addEventListener("click", () => {
  if (state.pin.length < 4) return;
  initReadyScreen();
  showScreen("screen-ready");
});

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

  $("ready-vest-native").textContent   = t("vestName");
  $("ready-vest-ko").textContent       = state.lang !== "ko" ? "안전조끼" : "";
  $("ready-wear2-native").textContent  = t("wearCheck");
  $("ready-wear2-ko").textContent      = state.lang !== "ko" ? "착용 필수" : "";

  $("start-native").textContent = t("startScan");
  $("start-ko").textContent     = state.lang !== "ko" ? "촬영 시작" : "";
}

$("btn-start-scan").addEventListener("click", () => {
  flash();
  initScanScreen();
  showScreen("screen-scanning");
  runScanAnimation();
});

/* ── 스캔 애니메이션 ─────────────────────────── */
function initScanScreen() {
  $("scan-label-native").textContent = t("scanLabel");
  $("scan-label-ko").textContent     = state.lang !== "ko" ? "PPE 착용 상태를 확인하고 있습니다" : "";

  $("status-helmet-native").textContent = t("helmetName");
  $("status-helmet-ko").textContent     = state.lang !== "ko" ? "안전모" : "";
  $("status-vest-native").textContent   = t("vestName");
  $("status-vest-ko").textContent       = state.lang !== "ko" ? "안전조끼" : "";

  $("box-helmet-label").textContent = t("helmetName");
  $("box-vest-label").textContent   = t("vestName");

  // 초기화
  ["box-helmet","box-vest"].forEach((id) => {
    const el = $(id);
    el.classList.remove("detected","missing");
  });
  ["status-helmet","status-vest"].forEach((id) => {
    const el = $(id);
    el.className = "ppe-status scanning";
    el.querySelector(".status-icon").textContent = "⏳";
    el.querySelector(".status-tag").textContent  = "감지중...";
  });
  $("progress-bar").style.width = "0%";
  $("prog-pct").textContent = "0%";
}

function runScanAnimation() {
  // 실제 환경: 카메라 캡처 후 API 호출
  // 현재는 모의 진행 후 API 호출
  let progress = 0;
  const timer = setInterval(() => {
    progress += Math.random() * 8 + 3;
    if (progress >= 100) { progress = 100; clearInterval(timer); }
    $("progress-bar").style.width = progress + "%";
    $("prog-pct").textContent = Math.round(progress) + "%";
  }, 120);

  // 헬멧 감지 (1.2초 후)
  setTimeout(() => detectItem("helmet", true), 1200);
  // 조끼 감지 (2.0초 후)
  setTimeout(() => detectItem("vest", true), 2000);
  // 결과 (3.0초 후)
  setTimeout(() => {
    // TODO: 실제 API 호출로 교체
    // callCheckinAPI().then(result => showResult(result));
    showResult({ helmetOk: true, vestOk: true }); // 임시 mock
  }, 3000);
}

function detectItem(item, ok) {
  const box    = $(`box-${item}`);
  const status = $(`status-${item}`);
  box.classList.add(ok ? "detected" : "missing");
  status.className = `ppe-status ${ok ? "detected" : "missing"}`;
  status.querySelector(".status-icon").textContent = ok ? "✅" : "❌";
  status.querySelector(".status-tag").textContent  = ok ? "감지됨" : "미착용";
}

/* ── API 호출 (실제 백엔드 연동 시 사용) ───────── */
async function callCheckinAPI() {
  const token = localStorage.getItem("token");
  // 카메라 캡처는 별도 구현 필요
  const res = await fetch("/user/checkin", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: new FormData(), // 실제로는 이미지 첨부
  });
  return res.json();
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

function showPassScreen({ helmetOk, vestOk }) {
  const lang = LANGUAGES.find((l) => l.code === state.lang);
  $("pass-pin-badge").textContent = `${lang?.flag || ""} ●●●-●●●●-${state.pin}`;
  $("pass-ppe-info").textContent  = `${t("helmetName")} ✅  ${t("vestName")} ✅`;

  $("pass-tts-label").textContent  = "🔊 TTS";
  $("pass-msg-native").textContent = t("passMsg");
  $("pass-msg-ko").textContent     = state.lang !== "ko" ? T["ko"].passMsg : "";

  $("next-native").textContent = t("nextBtn");
  $("next-ko").textContent     = state.lang !== "ko" ? "다음 작업자" : "";

  speak(t("ttsPassed") + ". " + t("passMsg"), state.lang);
  showScreen("screen-pass");
}

function showFailScreen({ helmetOk, vestOk }) {
  const lang = LANGUAGES.find((l) => l.code === state.lang);
  $("fail-pin-badge").textContent = `${lang?.flag || ""} ●●●-●●●●-${state.pin}`;

  $("fail-tts-label").textContent  = "🔊 TTS";
  $("fail-msg-native").textContent = t("failMsg");
  $("fail-msg-ko").textContent     = state.lang !== "ko" ? T["ko"].failMsg : "";

  // 미착용 항목 표시
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

  $("retry-native").textContent = t("retryBtn");
  $("retry-ko").textContent     = state.lang !== "ko" ? "다시 시도" : "";

  // 에스컬레이션 (3회 이상 실패)
  if (state.failCount >= 3) {
    $("btn-retry").style.display = "none";
    $("escalation-box").style.display = "";
    $("escalation-native").textContent = t("escalationNative");
    $("escalation-ko").textContent     = t("escalationKo");
    $("reset-native").textContent = t("resetBtn");
  } else {
    $("btn-retry").style.display = "";
    $("escalation-box").style.display = "none";
  }

  speak(t("ttsFailed") + ". " + t("failMsg"), state.lang);
  showScreen("screen-fail");
}

/* ── 버튼 이벤트 ─────────────────────────────── */
$("btn-reset").addEventListener("click", () => {
  state.pin = "";
  state.failCount = 0;
  speechSynthesis?.cancel();
  showScreen("screen-lang");
});

$("btn-next-worker").addEventListener("click", () => {
  state.pin = "";
  state.failCount = 0;
  speechSynthesis?.cancel();
  showScreen("screen-lang");
});

$("btn-retry").addEventListener("click", () => {
  flash();
  initScanScreen();
  showScreen("screen-scanning");
  runScanAnimation();
});

$("btn-reset-fail").addEventListener("click", () => {
  state.pin = "";
  state.failCount = 0;
  speechSynthesis?.cancel();
  showScreen("screen-lang");
});

/* ── 초기화 ──────────────────────────────────── */
initLangScreen();
showScreen("screen-lang");

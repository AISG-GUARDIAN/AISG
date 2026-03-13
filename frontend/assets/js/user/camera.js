/* ──────────────────────────────────────────────────
   camera.js  — AI SAFE GUARDIAN · 카메라 / 스캔 / 체크인 API
   index.html 전용 (app.js 의 state, $, t, speak 등 사용)
────────────────────────────────────────────────── */

/* ── 카메라 관리 ─────────────────────────────── */
async function startCamera() {
  const video = $("cam-video");
  const loading = $("cam-loading");
  const errBox = $("cam-error");

  loading.style.display = "";
  errBox.style.display = "none";
  video.style.display = "none";

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } },
      audio: false,
    });
    state.stream = stream;
    video.srcObject = stream;
    await video.play();
    loading.style.display = "none";
    video.style.display = "block";
  } catch (err) {
    loading.style.display = "none";
    errBox.style.display = "";
    $("cam-error-msg").textContent =
      err.name === "NotAllowedError"
        ? "카메라 권한이 없습니다 · Camera permission denied"
        : "카메라를 사용할 수 없습니다 · Camera unavailable";
  }
}

function stopCamera() {
  if (state.stream) {
    state.stream.getTracks().forEach((tr) => tr.stop());
    state.stream = null;
  }
}

function captureFrame() {
  const video = $("cam-video");
  const canvas = $("cam-canvas");
  if (!video || !video.videoWidth) return null;

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d").drawImage(video, 0, 0);
  return canvas;
}

/* ── 카메라 준비 화면 ────────────────────────── */
function initReadyScreen() {
  const lang = LANGUAGES.find((l) => l.code === state.lang);
  $("ready-badge").textContent = `${lang?.flag || ""} ●●●-●●●●-${state.pin}`;
  $("ready-greeting-native").textContent = t("greeting");
  $("ready-greeting-ko").textContent = state.lang !== "ko" ? "안녕하세요!" : "";

  $("ready-helmet-native").textContent = t("helmetName");
  $("ready-helmet-ko").textContent = state.lang !== "ko" ? "안전모" : "";
  $("ready-wear-native").textContent = t("wearCheck");
  $("ready-wear-ko").textContent = state.lang !== "ko" ? "착용 필수" : "";

  $("ready-vest-native").textContent = t("vestName");
  $("ready-vest-ko").textContent = state.lang !== "ko" ? "안전조끼" : "";
  $("ready-wear2-native").textContent = t("wearCheck");
  $("ready-wear2-ko").textContent = state.lang !== "ko" ? "착용 필수" : "";

  $("start-native").textContent = t("startScan");
  $("start-ko").textContent = state.lang !== "ko" ? "촬영 시작" : "";
}

/* ── 촬영 버튼 ───────────────────────────────── */
$("btn-start-scan").addEventListener("click", () => {
  if (!state.authenticated) { resetToLang(); return; }

  const canvas = captureFrame();
  if (!canvas) {
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
  showScreen("screen-scanning");
  runScanWithAPI();
}

/* ── 스캔 화면 ───────────────────────────────── */
function initScanScreen() {
  $("scan-label-native").textContent = t("scanLabel");
  $("scan-label-ko").textContent = state.lang !== "ko" ? "PPE 착용 상태를 확인하고 있습니다" : "";

  $("status-helmet-native").textContent = t("helmetName");
  $("status-helmet-ko").textContent = state.lang !== "ko" ? "안전모" : "";
  $("status-vest-native").textContent = t("vestName");
  $("status-vest-ko").textContent = state.lang !== "ko" ? "안전조끼" : "";

  $("box-helmet-label").textContent = t("helmetName");
  $("box-vest-label").textContent = t("vestName");

  ["box-helmet", "box-vest"].forEach((id) => $(id).classList.remove("detected", "missing"));
  ["status-helmet", "status-vest"].forEach((id) => {
    const el = $(id);
    el.className = "ppe-status scanning";
    el.querySelector(".status-icon").textContent = "⏳";
    el.querySelector(".status-tag").textContent = "감지중...";
  });
  $("progress-bar").style.width = "0%";
  $("prog-pct").textContent = "0%";
}

async function runScanWithAPI() {
  let progress = 0;
  const timer = setInterval(() => {
    progress = Math.min(progress + Math.random() * 6 + 2, 90);
    $("progress-bar").style.width = progress + "%";
    $("prog-pct").textContent = Math.round(progress) + "%";
  }, 120);

  try {
    if (!state.capturedBlob) {
      throw new Error("촬영된 이미지가 없습니다. 카메라를 확인하세요.");
    }

    const result = await api.checkin(state.capturedBlob);

    clearInterval(timer);
    $("progress-bar").style.width = "100%";
    $("prog-pct").textContent = "100%";

    detectItem("helmet", result.helmetOk);
    await delay(400);
    detectItem("vest", result.vestOk);
    await delay(600);

    showResult(result);
  } catch (err) {
    clearInterval(timer);
    console.error("API 오류:", err);

    if (err.message.includes("401")) {
      state.authenticated = false;
      localStorage.removeItem("token");
      resetToLang();
      return;
    }

    $("progress-bar").style.width = "100%";
    $("prog-pct").textContent = "오류";

    detectItem("helmet", false);
    await delay(400);
    detectItem("vest", false);
    await delay(600);

    state.failCount++;
    showFailScreen({ helmetOk: false, vestOk: false });
  }
}

function delay(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

function detectItem(item, ok) {
  const box = $(`box-${item}`);
  const status = $(`status-${item}`);
  box.classList.add(ok ? "detected" : "missing");
  status.className = `ppe-status ${ok ? "detected" : "missing"}`;
  status.querySelector(".status-icon").textContent = ok ? "✅" : "❌";
  status.querySelector(".status-tag").textContent = ok ? "감지됨" : "미착용";
}

/* ── 결과 분기 ───────────────────────────────── */
function showResult({ helmetOk, vestOk, needsAdmin, attempt }) {
  const passed = helmetOk && vestOk;
  flash();
  if (passed) {
    state.failCount = 0;
    showPassScreen({ helmetOk, vestOk });
  } else {
    state.failCount = attempt ?? (state.failCount + 1);
    showFailScreen({ helmetOk, vestOk, needsAdmin });
  }
}

/* ── PASS 화면 ───────────────────────────────── */
function showPassScreen({ helmetOk, vestOk }) {
  const lang = LANGUAGES.find((l) => l.code === state.lang);
  $("pass-pin-badge").textContent = `${lang?.flag || ""} ●●●-●●●●-${state.pin}`;
  $("pass-ppe-info").textContent = `${t("helmetName")} ✅  ${t("vestName")} ✅`;
  $("pass-tts-label").textContent = "🔊 TTS";
  $("pass-msg-native").textContent = t("passMsg");
  $("pass-msg-ko").textContent = state.lang !== "ko" ? T["ko"].passMsg : "";
  $("next-native").textContent = t("nextBtn");
  $("next-ko").textContent = state.lang !== "ko" ? "다음 작업자" : "";

  speak(t("ttsPassed") + ". " + t("passMsg"));
  showScreen("screen-pass");
  startAutoReset();
}

function startAutoReset() {
  clearAutoReset();
  let remaining = AUTO_RESET_SEC;
  const fill = $("auto-reset-fill");
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
function showFailScreen({ helmetOk, vestOk, needsAdmin }) {
  const lang = LANGUAGES.find((l) => l.code === state.lang);
  $("fail-pin-badge").textContent = `${lang?.flag || ""} ●●●-●●●●-${state.pin}`;
  $("fail-tts-label").textContent = "🔊 TTS";
  $("fail-msg-native").textContent = t("failMsg");
  $("fail-msg-ko").textContent = state.lang !== "ko" ? T["ko"].failMsg : "";

  const list = $("fail-ppe-list");
  list.innerHTML = "";
  [{ ok: helmetOk, key: "helmetName", ko: "안전모" },
  { ok: vestOk, key: "vestName", ko: "안전조끼" }].forEach(({ ok, key, ko }) => {
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

  $("guide-label").textContent = t("guidTitle");
  const ol = $("guide-list");
  ol.innerHTML = "";
  (t("guide") || []).forEach((step) => {
    const li = document.createElement("li");
    li.textContent = step;
    ol.appendChild(li);
  });

  $("retry-native").textContent = `🔄 ${t("retryBtn")} (${state.failCount}/3)`;
  $("retry-ko").textContent = state.lang !== "ko" ? `재시도 (${state.failCount}/3)` : "";

  if (needsAdmin || state.failCount >= 3) {
    $("btn-retry").style.display = "none";
    $("escalation-box").style.display = "";
    $("escalation-native").textContent = t("escalationNative");
    $("escalation-ko").textContent = t("escalationKo");
    $("reset-native").textContent = t("resetBtn");
  } else {
    $("btn-retry").style.display = "";
    $("escalation-box").style.display = "none";
  }

  speak(t("ttsFailed") + ". " + t("failMsg"), 3);
  showScreen("screen-fail");
}

/* ── 버튼 이벤트 (결과 화면) ─────────────────── */
$("btn-next-worker").addEventListener("click", resetToLang);

$("btn-retry").addEventListener("click", () => {
  if (!state.authenticated) { resetToLang(); return; }
  initReadyScreen();
  showScreen("screen-ready");
  startCamera();
});

$("btn-reset-fail").addEventListener("click", resetToLang);

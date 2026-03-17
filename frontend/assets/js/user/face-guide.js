/* ──────────────────────────────────────────────────
   face-guide.js — MediaPipe Face Detection 기반 자동 캡처

   스캔 화면에서 실시간으로 얼굴을 감지하고,
   정면이 확인되는 순간 자동으로 프레임을 캡처하여 콜백을 호출한다.
   감지 상태를 onStatus 콜백으로 실시간 전달한다.

   상태: "no_face" | "not_frontal" | "frontal"

   의존: @mediapipe/tasks-vision CDN (index.html에서 로드)
────────────────────────────────────────────────── */

const FaceGuide = (() => {
  let detector = null;
  let animFrameId = null;
  let _onCapture = null;   // (base64: string) => void
  let _onStatus = null;    // (status: string) => void
  let _captured = false;
  let _lastStatus = null;  // 상태 변경 시에만 콜백

  /**
   * MediaPipe FaceDetector 초기화
   */
  async function init() {
    if (detector) return;

    try {
      // ES module 로딩 대기 (최대 10초)
      let vis = window.vision || self.vision;
      if (!vis) {
        for (let i = 0; i < 20; i++) {
          await new Promise(r => setTimeout(r, 500));
          vis = window.vision || self.vision;
          if (vis) break;
        }
      }
      if (!vis) {
        console.warn("[FaceGuide] MediaPipe vision 번들 미로드 — 가이드 비활성");
        return;
      }

      const wasmFiles = await vis.FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
      );

      detector = await vis.FaceDetector.createFromOptions(wasmFiles, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        minDetectionConfidence: 0.5,
      });

      console.log("[FaceGuide] MediaPipe FaceDetector 초기화 완료");
    } catch (err) {
      console.error("[FaceGuide] 초기화 실패:", err);
      detector = null;
    }
  }

  /**
   * 실시간 감지 루프 시작 — 정면 감지 시 자동 캡처
   * @param {HTMLVideoElement} video — 웹캠 비디오 엘리먼트
   * @param {HTMLCanvasElement} canvas — 캡처용 캔버스
   * @param {Function} onCapture — (base64: string) 자동 캡처 콜백
   * @param {Function} [onStatus] — (status: "no_face"|"not_frontal"|"frontal") 상태 콜백
   */
  function startLoop(video, canvas, onCapture, onStatus) {
    _onCapture = onCapture;
    _onStatus = onStatus || null;
    _captured = false;
    _lastStatus = null;

    // detector 없으면 (초기화 실패) 2초 후 수동 캡처 fallback
    if (!detector) {
      console.warn("[FaceGuide] detector 없음 — 2초 후 자동 캡처 fallback");
      _emitStatus("no_face");
      setTimeout(() => {
        if (!_captured) {
          _captured = true;
          _emitStatus("frontal");
          const base64 = _captureFrame(video, canvas);
          if (base64 && _onCapture) _onCapture(base64);
        }
      }, 2000);
      return;
    }

    function tick() {
      if (_captured) return;
      if (!video || video.paused || video.ended || !video.videoWidth) {
        animFrameId = requestAnimationFrame(tick);
        return;
      }

      try {
        const now = performance.now();
        const result = detector.detectForVideo(video, now);
        const status = _getFaceStatus(result);

        _emitStatus(status);

        if (status === "frontal") {
          _captured = true;
          const base64 = _captureFrame(video, canvas);
          if (base64 && _onCapture) _onCapture(base64);
          return;
        }
      } catch (err) {
        // 간헐적 프레임 오류 무시
      }

      animFrameId = requestAnimationFrame(tick);
    }

    animFrameId = requestAnimationFrame(tick);
  }

  /** 감지 루프 중지 */
  function stopLoop() {
    if (animFrameId) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }
    _captured = true;
  }

  /** 상태 변경 시에만 콜백 호출 */
  function _emitStatus(status) {
    if (status !== _lastStatus) {
      _lastStatus = status;
      if (_onStatus) _onStatus(status);
    }
  }

  /**
   * 얼굴 상태 판정: "no_face" | "too_close" | "not_frontal" | "frontal"
   *
   * 상반신 체크: 얼굴 바운딩 박스가 프레임의 40% 이상을 차지하면
   * 얼굴만 클로즈업된 상태 → "too_close" (뒤로 물러나야 상반신이 잡힘)
   * 얼굴이 프레임 하단에 치우쳐 있으면 조끼가 안 보일 수 있으므로
   * 얼굴 중심이 프레임 상단 20~55% 범위에 있어야 OK
   */
  function _getFaceStatus(result) {
    if (!result || !result.detections || result.detections.length === 0) {
      return "no_face";
    }

    const det = result.detections[0];
    const kp = det.keypoints;
    if (!kp || kp.length < 6) return "no_face";

    const bb = det.boundingBox;

    // 상반신 체크 — 얼굴이 작고 프레임 상단에 위치해야 조끼까지 잡힘
    if (bb) {
      const video = document.getElementById("webcam");
      if (video && video.videoWidth) {
        const faceRatioW = bb.width / video.videoWidth;
        const faceRatioH = bb.height / video.videoHeight;
        // 얼굴이 프레임의 25% 이상이면 너무 가까움 (상반신이 안 잡힘)
        if (faceRatioW > 0.25 || faceRatioH > 0.3) {
          return "too_close";
        }
        // 얼굴 중심 Y가 프레임 상단 35% 아래면 조끼가 잘림
        const faceCenterY = (bb.originY + bb.height / 2) / video.videoHeight;
        if (faceCenterY > 0.35) {
          return "too_close";
        }
      }
    }

    const rightEye = kp[0];
    const leftEye = kp[1];
    const noseTip = kp[2];
    const rightEar = kp[4];
    const leftEar = kp[5];

    // 정면 체크 — 코가 눈 중심에서 벗어나면 비정면
    const eyeCenterX = (rightEye.x + leftEye.x) / 2;
    const eyeSpan = Math.abs(leftEye.x - rightEye.x);
    if (eyeSpan > 0 && Math.abs(noseTip.x - eyeCenterX) / eyeSpan > 0.25) {
      return "not_frontal";
    }

    // 귀 대칭 — 비율 40% 미만이면 비정면
    const rDist = Math.abs(noseTip.x - rightEar.x);
    const lDist = Math.abs(noseTip.x - leftEar.x);
    if (Math.min(rDist, lDist) / Math.max(rDist, lDist) < 0.4) {
      return "not_frontal";
    }

    return "frontal";
  }

  /** 비디오 프레임을 캔버스에 그려 BASE64로 반환 */
  function _captureFrame(video, canvas) {
    if (!video || !video.videoWidth) return null;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    return canvas.toDataURL("image/jpeg", 0.85);
  }

  /** detector 로딩 여부 */
  function isReady() {
    return detector !== null;
  }

  return { init, startLoop, stopLoop, isReady };
})();

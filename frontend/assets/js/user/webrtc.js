/* ──────────────────────────────────────────────────
   webrtc.js — AI SAFE GUARDIAN · WebRTC 스트리밍 클라이언트

   시그널링 프로토콜 (WebSocket):
     C→S  { type:"offer",     sdp: RTCSessionDescription, sessionId: string }
     S→C  { type:"answer",    sdp: RTCSessionDescription }
     C→S  { type:"candidate", candidate: RTCIceCandidate }
     S→C  { type:"candidate", candidate: RTCIceCandidate }
     C→S  { type:"capture" }                 ← 프레임 분석 요청
     S→C  { type:"result", helmetOk:bool, vestOk:bool }
     S→C  { type:"error",  message:string }
────────────────────────────────────────────────── */

class WebRTCClient {
  /**
   * @param {object} opts
   * @param {string}   [opts.signalingUrl]       ws(s)://host/ws/signal
   * @param {Function} [opts.onResult]           ({helmetOk, vestOk}) 콜백
   * @param {Function} [opts.onStateChange]      (state: string) 콜백
   * @param {object[]} [opts.iceServers]         ICE 서버 목록
   */
  constructor(opts = {}) {
    this.signalingUrl   = opts.signalingUrl   || WebRTCClient._defaultWsUrl();
    this.onResult       = opts.onResult       || null;
    this.onStateChange  = opts.onStateChange  || null;
    this.iceServers     = opts.iceServers     || [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
    ];

    this._pc  = null;  // RTCPeerConnection
    this._ws  = null;  // WebSocket (signaling)
    this._dc  = null;  // RTCDataChannel (results)
    this._sessionId = null;
    this._connected = false;
  }

  /* ── 공개 API ──────────────────────────────── */

  /**
   * 카메라 스트림을 백엔드로 전송 시작
   * @param {MediaStream} stream  getUserMedia 스트림
   * @returns {Promise<boolean>}  연결 성공 여부
   */
  async start(stream) {
    this.stop();  // 기존 연결 정리
    this._sessionId = this._uuid();
    this._notify("connecting");

    return new Promise((resolve) => {
      const ws = new WebSocket(this.signalingUrl);
      this._ws = ws;

      const timeout = setTimeout(() => {
        ws.close();
        this._notify("timeout");
        resolve(false);
      }, 8000);

      ws.onopen = async () => {
        clearTimeout(timeout);
        try {
          await this._createPeerConnection(stream);
          resolve(true);
        } catch (e) {
          console.error("[WebRTC] PeerConnection 생성 실패:", e);
          this._notify("error");
          resolve(false);
        }
      };

      ws.onmessage = (e) => this._handleSignal(JSON.parse(e.data));

      ws.onerror = () => {
        clearTimeout(timeout);
        this._notify("error");
        resolve(false);
      };

      ws.onclose = () => {
        this._connected = false;
        this._notify("disconnected");
      };
    });
  }

  /**
   * 현재 프레임 PPE 감지 요청
   * 백엔드가 DataChannel 또는 WebSocket으로 result를 반환함
   */
  requestCapture() {
    if (!this._connected) return false;
    this._send({ type: "capture", sessionId: this._sessionId });
    return true;
  }

  /** 연결 종료 */
  stop() {
    this._connected = false;
    if (this._dc) { try { this._dc.close(); } catch {} this._dc = null; }
    if (this._pc) { try { this._pc.close(); } catch {} this._pc = null; }
    if (this._ws) { try { this._ws.close(); } catch {} this._ws = null; }
  }

  get isConnected() { return this._connected; }

  /* ── 내부 ──────────────────────────────────── */

  async _createPeerConnection(stream) {
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    this._pc = pc;

    // 비디오 트랙 추가
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    // ICE 후보 전송
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) this._send({ type: "candidate", candidate });
    };

    // 연결 상태 감시
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      this._connected = (s === "connected");
      this._notify(s);
    };

    // DataChannel: 서버가 결과를 JSON으로 전송
    const dc = pc.createDataChannel("results", { ordered: true });
    this._dc = dc;
    dc.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "result" && this.onResult) {
          this.onResult({ helmetOk: msg.helmetOk, vestOk: msg.vestOk });
        }
      } catch {}
    };

    // Offer 생성 → 전송
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this._send({ type: "offer", sdp: pc.localDescription, sessionId: this._sessionId });
  }

  async _handleSignal(msg) {
    const pc = this._pc;
    if (!pc) return;

    try {
      if (msg.type === "answer") {
        await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));

      } else if (msg.type === "candidate" && msg.candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));

      } else if (msg.type === "result" && this.onResult) {
        // WebSocket 경로로 result가 오는 경우 (DataChannel 대신)
        this.onResult({ helmetOk: msg.helmetOk, vestOk: msg.vestOk });

      } else if (msg.type === "error") {
        console.warn("[WebRTC] 서버 오류:", msg.message);
      }
    } catch (e) {
      console.error("[WebRTC] 시그널 처리 오류:", e);
    }
  }

  _send(data) {
    if (this._ws && this._ws.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify(data));
    }
  }

  _notify(state) {
    if (this.onStateChange) this.onStateChange(state);
  }

  static _defaultWsUrl() {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${location.host}/ws/signal`;
  }

  static _uuid() {
    return crypto?.randomUUID?.() ||
      "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
      });
  }

  _uuid() { return WebRTCClient._uuid(); }
}

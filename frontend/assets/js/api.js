/* ──────────────────────────────────────────────────
   api.js  — AI SAFE GUARDIAN · API 통신 모듈
────────────────────────────────────────────────── */

const API_BASE = "";

const api = {
    async loginUser(pin, lang) {
        const res = await fetch(`${API_BASE}/auth/user/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ last_call_number: pin, language: lang }),
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || `HTTP ${res.status}`);
        }

        return await res.json();
    },

    async loginEmployee(empNo, lang) {
        const res = await fetch(`${API_BASE}/auth/employee/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ emp_no: empNo, language: lang }),
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || "로그인 실패");
        }

        return await res.json();
    },

    /* ── 관리자 API ── */

    /** 관리자 로그인 — 사원번호로 인증 후 JWT 반환 */
    async loginAdmin(empNo) {
        const res = await fetch(`${API_BASE}/auth/admin/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ emp_no: empNo }),
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || "관리자 로그인 실패");
        }

        const data = await res.json();
        // 토큰·역할을 localStorage에 저장
        localStorage.setItem("admin_token", data.access_token);
        localStorage.setItem("admin_role", data.role);
        return data;
    },

    /** 관리자 로그아웃 — 로컬 토큰 삭제 */
    logoutAdmin() {
        localStorage.removeItem("admin_token");
        localStorage.removeItem("admin_role");
    },

    /** 관리자 토큰 반환 (없으면 null) */
    getAdminToken() {
        return localStorage.getItem("admin_token");
    },

    /** 인증 헤더가 포함된 관리자 전용 fetch 래퍼 */
    async _adminFetch(url, options = {}) {
        const token = this.getAdminToken();
        if (!token) throw new Error("401: 관리자 인증 토큰 없음");

        const headers = { ...options.headers, Authorization: `Bearer ${token}` };
        const res = await fetch(`${API_BASE}${url}`, { ...options, headers });

        if (res.status === 401) {
            this.logoutAdmin();
            throw new Error("401: 세션이 만료되었습니다");
        }

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || `HTTP ${res.status}`);
        }

        return res.json();
    },

    /** 대시보드 통계 조회 (기존 그룹별/기간별) */
    async getAdminStats(periodType = "daily", count = 7) {
        return this._adminFetch(`/admin/stats?period_type=${periodType}&count=${count}`);
    },

    /** 대시보드 전체 데이터 조회 (KPI, 시간대별, 언어별, 세션, 일별, 월별) */
    async getDashboard() {
        return this._adminFetch("/admin/stats/dashboard");
    },

    /** 체크인 세션 목록 조회 */
    async getAdminSessions(targetDate, groupId) {
        let url = "/admin/sessions";
        const params = [];
        if (targetDate) params.push(`target_date=${targetDate}`);
        if (groupId) params.push(`group_id=${groupId}`);
        if (params.length) url += "?" + params.join("&");
        return this._adminFetch(url);
    },

    /** 관리자 오버라이드 (수동 통과) */
    async overrideSession(sessionId, reason) {
        return this._adminFetch(`/admin/sessions/${sessionId}/override`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reason: reason || null }),
        });
    },

    /** 알림 목록 조회 (3회 실패 관리자 호출) */
    async getNotifications(status, targetDate) {
        const params = [];
        if (status) params.push(`status=${status}`);
        if (targetDate) params.push(`target_date=${targetDate}`);
        const qs = params.length ? "?" + params.join("&") : "";
        return this._adminFetch(`/admin/notifications${qs}`);
    },

    /** 그룹 목록 조회 */
    async getGroups() {
        return this._adminFetch("/admin/groups");
    },

    /** 그룹 생성 */
    async createGroup(name) {
        return this._adminFetch("/admin/groups", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name }),
        });
    },

    /** 그룹 수정 */
    async updateGroup(groupId, name) {
        return this._adminFetch(`/admin/groups/${groupId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name }),
        });
    },

    /** 그룹 삭제 */
    async deleteGroup(groupId) {
        const token = this.getAdminToken();
        if (!token) throw new Error("401: 관리자 인증 토큰 없음");
        const res = await fetch(`${API_BASE}/admin/groups/${groupId}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 401) { this.logoutAdmin(); throw new Error("401: 세션이 만료되었습니다"); }
        if (!res.ok && res.status !== 204) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || `HTTP ${res.status}`);
        }
    },

    /** 서버 헬스체크 */
    async healthCheck() {
        const res = await fetch(`${API_BASE}/api/health`);
        return res.ok;
    },

    /* ── 작업자 API ── */

    async checkin(imageBlob) {
        const token = localStorage.getItem("token");
        if (!token) throw new Error("401: 인증 토큰 없음");

        const role = localStorage.getItem("role") || "user";
        const endpoint = role === "employee" ? "/employee/checkin" : "/user/checkin";

        const form = new FormData();
        form.append("image", imageBlob, "capture.jpg");

        const res = await fetch(`${API_BASE}${endpoint}`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: form,
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(`${res.status}: ${err.detail || "서버 오류"}`);
        }

        const data = await res.json();
        return {
            helmetOk: data.helmet_pass,
            vestOk: data.vest_pass,
            needsAdmin: data.needs_admin,
            attempt: data.attempt_count,
            message: data.message,
        };
    }
};

// ════════════════════════════════════════════════════════════
// 현황판 전용 JS (단독 실행 가능)
// ════════════════════════════════════════════════════════════
//
// 이 파일은 두 가지 모드로 동작합니다:
// 1) 단독 실행: /admin/simple 에서 API로 실제 데이터를 fetch
// 2) 기존 admin.js와 통합: dashData가 이미 있으면 그 데이터를 사용

/**
 * 단독 페이지 진입점 — API에서 대시보드 데이터를 가져온 뒤 렌더링한다.
 * 인증 토큰이 없으면 로그인 폼을 표시한다.
 */
async function initStatusPage() {
  // 이미 admin.js에서 dashData를 세팅한 경우 바로 렌더링
  if (typeof dashData !== 'undefined') {
    renderStatusPage(dashData);
    return;
  }

  // 토큰 확인 — 없으면 로그인 폼 표시
  if (!api.getAdminToken()) {
    renderLoginForm();
    return;
  }

  await fetchAndRender();
}

/** API에서 대시보드 데이터를 가져와 렌더링한다. */
async function fetchAndRender() {
  const container = document.getElementById('status-page-content');
  container.innerHTML = '<div style="text-align:center;padding:80px;color:#6B7280;font-size:18px;">데이터 로딩 중...</div>';

  try {
    const data = await api.getDashboard();
    renderStatusPage(data);
  } catch (e) {
    console.error('대시보드 API 호출 실패:', e.message);
    if (e.message.includes('401')) {
      renderLoginForm('세션이 만료되었습니다. 다시 로그인해주세요.');
    } else {
      container.innerHTML = `<div style="text-align:center;padding:80px;color:#8B0000;font-size:18px;">데이터 로딩 실패: ${e.message}</div>`;
    }
  }
}

/** 관리자 로그인 폼을 표시한다. */
function renderLoginForm(msg) {
  const container = document.getElementById('status-page-content');
  container.innerHTML = `
    <div style="max-width:400px; margin:0 auto; background:#fff; border-radius:20px; padding:48px 36px; box-shadow:0 2px 12px rgba(0,0,0,0.08);">
      <div style="text-align:center; margin-bottom:32px;">
        <div style="font-size:32px; font-weight:900; color:#111827;">현황판 로그인</div>
        <div style="font-size:14px; color:#6B7280; margin-top:8px;">관리자 사원번호를 입력하세요</div>
      </div>
      ${msg ? `<div style="background:#FEF2F2; color:#991B1B; padding:10px 16px; border-radius:10px; font-size:14px; margin-bottom:16px; text-align:center;">${msg}</div>` : ''}
      <input id="simple-emp-no" type="text" placeholder="사원번호" style="
        width:100%; padding:14px 16px; border:2px solid #D1D5DB; border-radius:12px;
        font-size:18px; font-family:inherit; outline:none; transition:border-color .2s;
      " onfocus="this.style.borderColor='#1A56A0'" onblur="this.style.borderColor='#D1D5DB'" />
      <button onclick="handleSimpleLogin()" style="
        width:100%; margin-top:16px; padding:14px; border:none; border-radius:12px;
        background:#1A56A0; color:#fff; font-size:18px; font-weight:700;
        cursor:pointer; font-family:inherit;
      ">로그인</button>
    </div>
  `;

  // Enter 키 지원
  document.getElementById('simple-emp-no').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleSimpleLogin();
  });
  document.getElementById('simple-emp-no').focus();
}

/** 로그인 처리 후 대시보드 데이터를 가져온다. */
async function handleSimpleLogin() {
  const input = document.getElementById('simple-emp-no');
  const empNo = input?.value?.trim();
  if (!empNo) return;

  try {
    await api.loginAdmin(empNo);
    await fetchAndRender();
  } catch (e) {
    renderLoginForm('로그인 실패: ' + e.message);
  }
}

// ════════════════════════════════════════════════════════════
// 현황판 렌더링 함수
// ════════════════════════════════════════════════════════════
//
// 원칙:
// - 숫자만 크게, 한눈에 파악
// - 70% 이상 → 초록, 51~69% → 노랑, 50% 이하 → 빨강
// - 국적·그룹·정규/일용 구분 없음 (인권·차별 이슈 배제)

function renderStatusPage(data) {
  const container = document.getElementById('status-page-content');
  const kpi = data?.kpi;
  const monthly = data?.monthly || [];

  // ── 오늘 통과율 ──
  const todayTotal = kpi ? kpi.total_all : 0;
  const todayPass = kpi ? kpi.total_pass : 0;
  const todayRate = todayTotal > 0 ? (todayPass / todayTotal * 100).toFixed(1) : '0.0';

  // ── 날짜 ──
  const now = new Date();
  const month = now.getMonth() + 1;

  // ── 월별 데이터 ──
  const thisMonth = monthly.find(m => m.month === month);
  const lastMonth = monthly.find(m => m.month === month - 1);

  const thisMonthRate = thisMonth && thisMonth.total > 0
    ? (thisMonth.pass_count / thisMonth.total * 100).toFixed(0) : '--';
  const lastMonthRate = lastMonth && lastMonth.total > 0
    ? (lastMonth.pass_count / lastMonth.total * 100).toFixed(0) : '--';

  const lastMonthNum = month - 1;

  // ── 색상 판별: 70%↑ 초록, 51~69% 노랑, 50%↓ 빨강 ──
  function rateColor(rate) {
    const r = parseFloat(rate);
    if (isNaN(r)) return '#6B7280';
    if (r >= 70) return '#3C7853';
    if (r >= 51) return '#DAA520';
    return '#8B0000';
  }

  const todayBg = rateColor(todayRate);
  const lastMonthColor = rateColor(lastMonthRate);
  const thisMonthColor = rateColor(thisMonthRate);

  container.innerHTML = `
    <div style="padding:8px;">
      <!-- 타이틀 바 -->
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:20px;">
        <div style="font-size:26px; font-weight:900; color:#111827;">안전점검 통과율 현황</div>
        <div style="background:#EBF2FF; color:#1A56A0; border-radius:10px; padding:6px 16px; font-size:14px; font-weight:700;">기준일 : 오늘</div>
      </div>

      <!-- 메인 레이아웃 -->
      <div style="display:flex; gap:20px; align-items:stretch;">

        <!-- 왼쪽: 오늘자 카드 -->
        <div style="flex:1.4; background:${todayBg}; border-radius:24px; padding:48px 40px; display:flex; flex-direction:column; justify-content:center;">
          <div style="font-size:30px; font-weight:800; color:rgba(255,255,255,0.85); margin-bottom:16px;">오늘자</div>
          <div style="font-size:120px; font-weight:900; color:#FFFFFF; line-height:1; letter-spacing:-3px;">${todayRate}%</div>
        </div>

        <!-- 오른쪽: 보조 카드 2개 -->
        <div style="flex:0.8; display:flex; flex-direction:column; gap:20px;">

          <!-- 지난달 카드 -->
          <div style="flex:1; background:#FFFFFF; border-radius:20px; padding:32px 28px; display:flex; flex-direction:column; justify-content:center; border:1px solid #E5E7EB;">
            <div style="font-size:21px; font-weight:800; color:#374151; margin-bottom:12px;">지난달 (${lastMonthNum > 0 ? lastMonthNum + '월' : '--'})</div>
            <div style="font-size:60px; font-weight:900; color:${lastMonthColor}; line-height:1;">${lastMonthRate}%</div>
            <div style="font-size:15px; font-weight:500; color:#9CA3AF; margin-top:8px;">전월 실적</div>
          </div>

          <!-- 이번달 누적률 카드 -->
          <div style="flex:1; background:#FFFFFF; border-radius:20px; padding:32px 28px; display:flex; flex-direction:column; justify-content:center; border:1px solid #E5E7EB;">
            <div style="font-size:21px; font-weight:800; color:#374151; margin-bottom:12px;">이번달 누적률</div>
            <div style="font-size:60px; font-weight:900; color:${thisMonthColor}; line-height:1;">${thisMonthRate}%</div>
            <div style="font-size:15px; font-weight:500; color:#9CA3AF; margin-top:8px;">월 누적 기준</div>
          </div>

        </div>
      </div>
    </div>
  `;
}

// ════════════════════════════════════════════════════════════
// 현황판 전용 JS (단독 실행 가능)
// ════════════════════════════════════════════════════════════
//
// 이 파일은 두 가지 모드로 동작합니다:
// 1) 단독 실행: admin-simple.html에서 직접 열면 아래 mock 데이터로 표시
// 2) 기존 admin.js와 통합: dashData가 이미 있으면 그 데이터를 사용

// ── dashData가 없으면 mock 데이터 사용 ──
if (typeof dashData === 'undefined') {
  var dashData = {
    kpi: {
      safety_rate: 72.5, total_pass: 58, total_fail: 22,
      pending_count: 4, total_all: 80, yesterday_rate: 65.0,
      last_hour_pass: 5, last_hour_fail: 2, pending_urgent: 2,
    },
    monthly: [
      { month: 2, total: 180, pass_count: 110, fail_count: 70 },
      { month: 3, total: 203, pass_count: 147, fail_count: 56 },
    ],
  };
}

// ════════════════════════════════════════════════════════════
// 현황판 렌더링 함수
// ════════════════════════════════════════════════════════════
//
// 원칙:
// - 숫자만 크게, 한눈에 파악
// - 70% 이상 → 초록, 51~69% → 노랑, 50% 이하 → 빨강
// - 국적·그룹·정규/일용 구분 없음 (인권·차별 이슈 배제)

function renderStatusPage() {
  const container = document.getElementById('status-page-content');
  const kpi = dashData?.kpi;
  const monthly = dashData?.monthly || [];

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
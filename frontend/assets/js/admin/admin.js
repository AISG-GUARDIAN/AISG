// ════════════════════════════════════════════════════════════
// 0. 인증 가드 & 로그인/로그아웃
// ════════════════════════════════════════════════════════════

function showLoginScreen() {
  document.getElementById('login-overlay').classList.remove('hidden');
}

function hideLoginScreen() {
  document.getElementById('login-overlay').classList.add('hidden');
}

async function handleAdminLogin(e) {
  e.preventDefault();
  const empNo = document.getElementById('login-emp-no').value.trim();
  const errorEl = document.getElementById('login-error');
  const btn = document.getElementById('login-btn');

  if (!empNo) return;

  errorEl.style.display = 'none';
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 로그인 중...';

  try {
    await api.loginAdmin(empNo);
    hideLoginScreen();
    initDashboard();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-right-to-bracket"></i> 로그인';
  }
}

function handleAdminLogout() {
  api.logoutAdmin();
  document.getElementById('login-emp-no').value = '';
  document.getElementById('login-error').style.display = 'none';
  showLoginScreen();
}

function checkAuth() {
  if (api.getAdminToken()) {
    hideLoginScreen();
    return true;
  }
  showLoginScreen();
  return false;
}

// ════════════════════════════════════════════════════════════
// 1. UI 상수 (언어 라벨/색상/플래그 매핑)
// ════════════════════════════════════════════════════════════

const LANG_META = {
  '베트남어': { flag: '🇻🇳', color: '#F47C20' },
  '중국어':   { flag: '🇨🇳', color: '#DC2626' },
  '크메르어': { flag: '🇰🇭', color: '#CA8A04' },
  '태국어':   { flag: '🇹🇭', color: '#7C3AED' },
  '한국어':   { flag: '🇰🇷', color: '#1A56A0' },
  '기타':     { flag: '🌐', color: '#64748B' },
};

// 정렬된 언어 순서 (차트/범례에서 일관되게 사용)
const LANG_ORDER = ['베트남어', '중국어', '크메르어', '태국어', '한국어', '기타'];

function langFlag(label) { return (LANG_META[label] || LANG_META['기타']).flag; }
function langColor(label) { return (LANG_META[label] || LANG_META['기타']).color; }

// ════════════════════════════════════════════════════════════
// 2. 글로벌 상태 (API 데이터로 채워짐)
// ════════════════════════════════════════════════════════════

let dashData = null;       // API 응답 전체
let TABLE_DATA = [];       // 체크인 기록 테이블용
let curFilter = 'ALL';
let curPage = 1;
const PER_PAGE = 8;

// 차트 인스턴스
let donutChartInstance = null;
let failDonutChartInstance = null;
let timeBarChartInstance = null;
let dailyChartInstance = null;
let monthlyChartInstance = null;
let monthlyNationChartInstance = null;

// 시간대별 차트에서 사용하는 데이터 (API로 채워짐)
let hourlyLabels = [];
let hourlyPassData = [];
let hourlyFailData = [];

// ════════════════════════════════════════════════════════════
// 3. 대시보드 초기화 — API 호출 후 모든 위젯 렌더
// ════════════════════════════════════════════════════════════

async function initDashboard() {
  try {
    dashData = await api.getDashboard();
  } catch (err) {
    console.error('대시보드 API 호출 실패:', err.message);
    // 인증 만료 시 로그인 화면으로
    if (err.message.includes('401')) {
      showLoginScreen();
      return;
    }
    dashData = null;
  }

  renderKPI();
  renderLanguageDonut();
  renderFailDonut();
  renderHourlyChart();
  renderNationStats();
  buildTableData();

  // 알림 배지 업데이트 (미처리 건수)
  loadNotificationBadge();
}

// ════════════════════════════════════════════════════════════
// 4. KPI 카드
// ════════════════════════════════════════════════════════════

function renderKPI() {
  const k = dashData?.kpi;
  const safetyRate  = k ? k.safety_rate : 0;
  const totalPass   = k ? k.total_pass : 0;
  const totalFail   = k ? k.total_fail : 0;
  const pending     = k ? k.pending_count : 0;
  const totalAll    = k ? k.total_all : 0;
  const ydRate      = k ? k.yesterday_rate : 0;
  const lhPass      = k ? k.last_hour_pass : 0;
  const lhFail      = k ? k.last_hour_fail : 0;
  const urgent      = k ? k.pending_urgent : 0;

  const rateDiff = (safetyRate - ydRate).toFixed(1);
  const rateArrow = rateDiff >= 0 ? '↑' : '↓';

  const el = (id) => document.getElementById(id);

  if (el('kpi-safety-rate'))  el('kpi-safety-rate').innerText = safetyRate + '%';
  if (el('kpi-total-pass'))   el('kpi-total-pass').innerText = totalPass.toLocaleString();
  if (el('kpi-total-fail'))   el('kpi-total-fail').innerText = totalFail.toLocaleString();
  if (el('kpi-pending'))      el('kpi-pending').innerText = pending;

  if (el('total-summary-count')) el('total-summary-count').innerText = totalAll.toLocaleString() + '건';
  if (el('total-summary-rate'))  el('total-summary-rate').innerText = safetyRate + '% PASS';

  if (el('kpi-safety-bar'))  el('kpi-safety-bar').style.width = safetyRate + '%';
  if (el('kpi-pass-bar'))    el('kpi-pass-bar').style.width = (totalAll > 0 ? Math.round(totalPass / totalAll * 100) : 0) + '%';
  if (el('kpi-fail-bar'))    el('kpi-fail-bar').style.width = (totalAll > 0 ? Math.round(totalFail / totalAll * 100) : 0) + '%';
  if (el('kpi-pending-bar')) el('kpi-pending-bar').style.width = (totalAll > 0 ? Math.round(pending / totalAll * 100) : 0) + '%';

  if (el('kpi-safety-trend')) el('kpi-safety-trend').innerText = `${rateArrow} 어제 대비 ${rateDiff}%`;
  if (el('kpi-pass-trend'))   el('kpi-pass-trend').innerText = `↑ 지난 1시간 +${lhPass}건`;
  if (el('kpi-fail-trend'))   el('kpi-fail-trend').innerText = `↗ 지난 1시간 +${lhFail}건`;
  if (el('kpi-pending-trend')) el('kpi-pending-trend').innerText = `↗ 긴급 ${urgent}건`;
}

// ════════════════════════════════════════════════════════════
// 5. 언어별 분포 도넛 차트
// ════════════════════════════════════════════════════════════

function renderLanguageDonut() {
  const langData = dashData?.by_language || [];

  const labels = langData.map(d => d.label);
  const counts = langData.map(d => d.count);
  const colors = langData.map(d => langColor(d.label));

  if (donutChartInstance) donutChartInstance.destroy();
  donutChartInstance = new Chart(document.getElementById('donutChart'), {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data: counts, backgroundColor: colors, borderWidth: 0 }]
    },
    options: { responsive: true, maintainAspectRatio: false, cutout: '75%', plugins: { legend: { display: false } } }
  });

  // HTML 범례 업데이트 — donutChart 아래의 범례 영역
  const legendContainer = document.getElementById('donutChart')?.closest('.card')?.querySelector('div[style*="flex-direction:column"]');
  if (legendContainer && langData.length > 0) {
    const total = counts.reduce((a, b) => a + b, 0) || 1;
    legendContainer.innerHTML = langData.map(d => {
      const pct = (d.count / total * 100).toFixed(0);
      return `
        <div style="display:flex; align-items:center; justify-content:space-between;">
          <div style="display:flex; align-items:center; gap:6px;">
            <div style="width:10px; height:10px; border-radius:3px; background:${langColor(d.label)};"></div>
            <span style="font-size:12px; color:#374151;">${langFlag(d.label)} ${d.label}</span>
          </div>
          <div style="display:flex; align-items:center; gap:6px;">
            <div style="width:60px; height:5px; background:#F3F4F6; border-radius:3px; overflow:hidden;">
              <div style="width:${pct}%; height:100%; background:${langColor(d.label)};"></div>
            </div>
            <span style="font-size:12px; font-weight:600; color:#111827; min-width:28px; text-align:right;">${pct}%</span>
          </div>
        </div>`;
    }).join('');
  }
}

// ════════════════════════════════════════════════════════════
// 6. 언어별 FAIL 도넛 차트
// ════════════════════════════════════════════════════════════

function renderFailDonut() {
  const langData = dashData?.by_language || [];
  const failEntries = langData.filter(d => d.fail_count > 0);

  const labels = failEntries.map(d => `${langFlag(d.label)} ${d.label}`);
  const failCounts = failEntries.map(d => d.fail_count);
  const colors = failEntries.map(d => langColor(d.label));
  const totalFail = failCounts.reduce((a, b) => a + b, 0);

  if (failDonutChartInstance) failDonutChartInstance.destroy();
  failDonutChartInstance = new Chart(document.getElementById('failDonutChart'), {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data: failCounts, backgroundColor: colors, borderWidth: 2, borderColor: '#fff' }]
    },
    options: { responsive: true, maintainAspectRatio: false, cutout: '68%', plugins: { legend: { display: false } } }
  });

  // 중앙 텍스트 업데이트
  const centerDiv = document.getElementById('failDonutChart')?.parentElement?.querySelector('[style*="position:absolute"]');
  if (centerDiv) {
    centerDiv.innerHTML = `
      <div style="font-size:16px; font-weight:700; color:#DC2626; line-height:1;">FAIL</div>
      <div style="font-size:9px; color:#9CA3AF; margin-top:2px;">${totalFail}건</div>`;
  }

  // 상단 총건수 배지
  const badge = document.getElementById('failDonutChart')?.closest('.card')?.querySelector('[style*="background:#FEF2F2"]');
  if (badge) badge.textContent = `총 ${totalFail}건`;

  // HTML 범례
  const legendContainer = document.getElementById('failDonutChart')?.closest('.card')?.querySelector('div[style*="flex-direction:column"]');
  if (legendContainer) {
    const allLang = dashData?.by_language || [];
    legendContainer.innerHTML = allLang.map(d => {
      const pct = totalFail > 0 ? (d.fail_count / totalFail * 100).toFixed(0) : 0;
      return `
        <div style="display:flex; align-items:center; justify-content:space-between;">
          <div style="display:flex; align-items:center; gap:6px;">
            <div style="width:10px; height:10px; border-radius:3px; background:${langColor(d.label)};"></div>
            <span style="font-size:11px; color:#374151;">${langFlag(d.label)} ${d.label}</span>
          </div>
          <div style="display:flex; align-items:center; gap:6px;">
            <div style="width:50px; height:5px; background:#F3F4F6; border-radius:3px; overflow:hidden;">
              <div style="width:${pct}%; height:100%; background:${langColor(d.label)};"></div>
            </div>
            <span style="font-size:11px; font-weight:700; color:#111827; min-width:40px; text-align:right;">
              ${pct}% <span style="font-size:9px; color:#9CA3AF; font-weight:500;">${d.fail_count}건</span>
            </span>
          </div>
        </div>`;
    }).join('');
  }
}

// ════════════════════════════════════════════════════════════
// 7. 시간대별 체크인 바 차트
// ════════════════════════════════════════════════════════════

function renderHourlyChart() {
  const hourly = dashData?.hourly || [];

  hourlyLabels = hourly.map(h => h.hour + '시');
  hourlyPassData = hourly.map(h => h.pass_count);
  hourlyFailData = hourly.map(h => h.fail_count);

  renderTimeBarChart('all');
}

function renderTimeBarChart(view) {
  if (timeBarChartInstance) timeBarChartInstance.destroy();

  let datasets = [];
  if (view === 'all') {
    datasets = [
      { label: '통과 (PASS)', data: hourlyPassData, backgroundColor: '#059669', borderRadius: 6, borderSkipped: false },
      { label: '실패 (FAIL)', data: hourlyFailData, backgroundColor: '#DC2626', borderRadius: 6, borderSkipped: false }
    ];
  } else if (view === 'pass') {
    datasets = [{
      label: '통과 (PASS)', data: hourlyPassData, borderRadius: 8, borderSkipped: false,
      backgroundColor(ctx) {
        const { chart } = ctx; const { ctx: c, chartArea } = chart;
        if (!chartArea) return '#059669';
        const g = c.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
        g.addColorStop(0, '#10B981'); g.addColorStop(1, '#059669'); return g;
      }
    }];
  } else {
    datasets = [{
      label: '실패 (FAIL)', data: hourlyFailData, borderRadius: 8, borderSkipped: false,
      backgroundColor(ctx) {
        const { chart } = ctx; const { ctx: c, chartArea } = chart;
        if (!chartArea) return '#DC2626';
        const g = c.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
        g.addColorStop(0, '#F87171'); g.addColorStop(1, '#DC2626'); return g;
      }
    }];
  }

  timeBarChartInstance = new Chart(document.getElementById('timeBarChart'), {
    type: 'bar',
    data: { labels: hourlyLabels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: { duration: 600, easing: 'easeOutQuart' },
      plugins: {
        legend: { display: view === 'all', position: 'top', labels: { usePointStyle: true, pointStyle: 'circle', padding: 16, font: { size: 11, weight: 600 } } },
        tooltip: {
          backgroundColor: '#1E293B', titleFont: { size: 12, weight: 700 }, bodyFont: { size: 11 },
          padding: 10, cornerRadius: 10, displayColors: true,
          callbacks: { label(ctx) { return ' ' + ctx.dataset.label + ': ' + ctx.parsed.y + '건'; } }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 11, weight: 600 }, color: '#9CA3AF' } },
        y: { grid: { color: '#F3F4F6' }, ticks: { font: { size: 10 }, color: '#9CA3AF' }, beginAtZero: true }
      }
    }
  });
}

function switchChartView(view) {
  ['all', 'pass', 'fail'].forEach(v => {
    const btn = document.getElementById('chart-btn-' + v);
    btn.className = 'toggle-btn ';
    if (v === view) {
      btn.className += v === 'fail' ? 'fail-active' : 'pass-active';
      btn.style.cssText = v === 'all' ? 'background:#EBF2FF; color:#1A56A0; border-color:#1A56A0;' :
                          v === 'pass' ? 'background:#ECFDF5; color:#059669; border-color:#059669;' :
                          'background:#FEF2F2; color:#DC2626; border-color:#DC2626;';
    } else {
      btn.className += 'inactive';
      btn.style.cssText = '';
    }
  });
  renderTimeBarChart(view);
}

// ════════════════════════════════════════════════════════════
// 8. 국적별 체크인 인원 현황
// ════════════════════════════════════════════════════════════

function renderNationStats() {
  const langData = dashData?.by_language || [];
  const total = langData.reduce((a, d) => a + d.count, 0) || 1;
  const container = document.getElementById('nation-stats-container');

  container.innerHTML = langData.map(d => `
    <div class="nation-stat">
      <span class="text-2xl">${langFlag(d.label)}</span>
      <div class="flex-1">
        <div class="text-xs font-bold text-gray-800">${d.label}</div>
        <div class="text-[10px] text-gray-400">${(d.count / total * 100).toFixed(1)}%</div>
      </div>
      <div class="text-right">
        <div class="text-lg font-black" style="color:${langColor(d.label)}">${d.count}</div>
        <div class="text-[9px] text-gray-400 font-bold">명</div>
      </div>
    </div>
  `).join('');
}

// ════════════════════════════════════════════════════════════
// 9. 체크인 기록 테이블 (세션 API 데이터)
// ════════════════════════════════════════════════════════════

function buildTableData() {
  TABLE_DATA = (dashData?.sessions || []).map(s => ({
    id: `CHK-${String(s.id).padStart(4, '0')}`,
    flag: langFlag(s.label),
    lang: s.label,
    date: s.checked_at.split('T')[0] || '',
    time: s.checked_at.split('T')[1]?.slice(0, 8) || '',
    status: (s.status === 'pass' || s.status === 'pass_override') ? 'PASS' : 'FAIL',
  }));
}

function renderCheckinTable() {
  const filtered = TABLE_DATA.filter(r => (curFilter === 'ALL' || r.status === curFilter));
  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const start = (curPage - 1) * PER_PAGE;
  const paged = filtered.slice(start, start + PER_PAGE);

  document.getElementById('checkin-table-body').innerHTML = paged.map(row => `
    <tr class="trow transition-colors">
      <td class="px-6 py-4 font-bold text-blue-800 font-mono">${row.id}</td>
      <td class="px-6 py-4">
        <div class="flex items-center gap-2">
          <span class="text-base">${row.flag}</span>
          <span class="font-bold text-gray-800">${row.lang}</span>
        </div>
      </td>
      <td class="px-6 py-4 text-gray-400">${row.date} ${row.time}</td>
      <td class="px-6 py-4"><span class="font-black ${row.status === 'PASS' ? 'text-green-600' : 'text-red-600'}">${row.status}</span></td>
    </tr>
  `).join('');

  const showing = filtered.length > 0 ? `SHOWING ${start + 1}-${Math.min(start + PER_PAGE, filtered.length)} OF ${filtered.length}` : 'NO DATA';
  document.getElementById('pagination-info').innerText = showing;
  renderPagination(totalPages);
}

function renderPagination(total) {
  const container = document.getElementById('pagination-btns');
  let html = '';
  for (let i = 1; i <= total; i++) {
    html += `<button onclick="goPage(${i})" class="pg-btn ${curPage === i ? 'active' : ''}">${i}</button>`;
  }
  container.innerHTML = html;
}

function goPage(p) { curPage = p; renderCheckinTable(); }

function setFilter(f) {
  curFilter = f;
  curPage = 1;
  renderCheckinTable();
  document.querySelectorAll('[id^="filter-"]').forEach(btn => btn.classList.remove('active'));
  const activeBtn = document.getElementById(`filter-${f}-hist`);
  if (activeBtn) activeBtn.classList.add('active');
}

// ════════════════════════════════════════════════════════════
// 10. 네비게이션
// ════════════════════════════════════════════════════════════

const titleMap = {
  'dashboard': ['실시간 대시보드', '실시간 안전 모니터링 — 30초마다 자동 갱신'],
  'checkin':   ['체크인 기록', '작업자 체크인 이력 조회'],
  'daily':     ['일별 데이터', '일별 체크인 현황 분석'],
  'monthly':   ['월별 데이터', '월별 체크인 종합 분석'],
  'groups':    ['그룹 관리', '작업자 그룹 생성 및 관리'],
  'alarm':     ['시스템 알림', '알림 및 경고 메시지']
};

function navigate(p) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById('section-' + p).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
  document.getElementById('nav-' + p).classList.add('active');
  document.getElementById('page-title').innerText = titleMap[p][0];
  document.getElementById('page-subtitle').innerText = titleMap[p][1];
  if (p === 'checkin') { curPage = 1; renderCheckinTable(); }
  if (p === 'daily') { renderDailyPage(); }
  if (p === 'monthly') { renderMonthSelector(); }
  if (p === 'groups') { loadGroups(); }
  if (p === 'alarm') { loadNotifications(); }
}

// ════════════════════════════════════════════════════════════
// 11. 일별 데이터 페이지 (API daily 데이터 사용)
// ════════════════════════════════════════════════════════════

function renderDailyPage() {
  const daily = dashData?.daily || [];
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  document.getElementById('daily-title').innerText = `${year}년 ${month}월 일별 데이터`;
  document.getElementById('daily-next-btn').disabled = true;
  document.getElementById('daily-prev-btn').disabled = true;

  const totalPass = daily.reduce((a, d) => a + d.pass_count, 0);
  const totalFail = daily.reduce((a, d) => a + d.fail_count, 0);
  const totalAll = totalPass + totalFail;
  const rate = totalAll > 0 ? (totalPass / totalAll * 100).toFixed(1) : '0.0';

  document.getElementById('daily-kpi-row').innerHTML = `
    <div class="card kpi-card p-4">
      <p class="text-[11px] text-gray-500 font-medium mb-1">총 체크인</p>
      <h3 class="text-xl font-black text-gray-800">${totalAll.toLocaleString()}</h3>
    </div>
    <div class="card kpi-card p-4">
      <p class="text-[11px] text-gray-500 font-medium mb-1">PASS</p>
      <h3 class="text-xl font-black text-green-600">${totalPass.toLocaleString()}</h3>
    </div>
    <div class="card kpi-card p-4">
      <p class="text-[11px] text-gray-500 font-medium mb-1">FAIL</p>
      <h3 class="text-xl font-black text-red-600">${totalFail.toLocaleString()}</h3>
    </div>
    <div class="card kpi-card p-4">
      <p class="text-[11px] text-gray-500 font-medium mb-1">안전 확인율</p>
      <h3 class="text-xl font-black text-blue-700">${rate}%</h3>
    </div>
  `;

  // 바 차트
  if (dailyChartInstance) dailyChartInstance.destroy();
  dailyChartInstance = new Chart(document.getElementById('dailyBarChart'), {
    type: 'bar',
    data: {
      labels: daily.map(d => d.day + '일'),
      datasets: [
        { label: 'PASS', data: daily.map(d => d.pass_count), backgroundColor: '#059669', borderRadius: 4, borderSkipped: false },
        { label: 'FAIL', data: daily.map(d => d.fail_count), backgroundColor: '#DC2626', borderRadius: 4, borderSkipped: false }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: { duration: 600, easing: 'easeOutQuart' },
      plugins: {
        legend: { position: 'top', labels: { usePointStyle: true, pointStyle: 'circle', padding: 16, font: { size: 11, weight: 600 } } },
        tooltip: { backgroundColor: '#1E293B', cornerRadius: 10, padding: 10 }
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 10 }, color: '#9CA3AF', maxRotation: 0 }, stacked: true },
        y: { grid: { color: '#F3F4F6' }, ticks: { font: { size: 10 }, color: '#9CA3AF' }, beginAtZero: true, stacked: true }
      }
    }
  });

  // 국적별 테이블 — 사용된 언어 키 수집
  const usedLangs = new Set();
  daily.forEach(d => Object.keys(d.by_lang || {}).forEach(l => usedLangs.add(l)));
  const langCols = LANG_ORDER.filter(l => usedLangs.has(l));

  const thead = document.getElementById('daily-nation-thead');
  thead.innerHTML = '<th class="px-4 py-3">날짜</th>' + langCols.map(l => `<th class="px-4 py-3">${l}</th>`).join('') + '<th class="px-4 py-3">합계</th>';

  const tbody = document.getElementById('daily-nation-tbody');
  tbody.innerHTML = daily.map(d => `
    <tr class="trow transition-colors">
      <td class="px-4 py-3 font-bold text-gray-700">${month}/${d.day}</td>
      ${langCols.map(l => `<td class="px-4 py-3 text-center font-medium text-gray-600">${(d.by_lang || {})[l] || 0}</td>`).join('')}
      <td class="px-4 py-3 text-center font-black text-gray-800">${d.total}</td>
    </tr>
  `).join('');
}

function changeDailyMonth(delta) {
  // 현재는 대시보드 API가 이번 달 일별 데이터만 반환하므로
  // 이전/다음 달 네비게이션은 비활성 상태로 둔다
  // TODO: 월별 일별 데이터 API 추가 시 구현
}

// ════════════════════════════════════════════════════════════
// 12. 월별 데이터 페이지 (API monthly 데이터 사용)
// ════════════════════════════════════════════════════════════

let selectedMonth = null;

function renderMonthSelector() {
  const monthly = dashData?.monthly || [];
  const availableMonths = new Set(monthly.map(m => m.month));
  const now = new Date();
  const currentMonth = now.getMonth() + 1;

  const container = document.getElementById('month-selector');
  container.innerHTML = '';
  for (let m = 1; m <= 12; m++) {
    const isFuture = m > currentMonth;
    const hasData = availableMonths.has(m);
    const disabled = isFuture || !hasData;
    container.innerHTML += `
      <button onclick="${disabled ? '' : 'selectMonth(' + m + ')'}"
        class="month-btn ${selectedMonth === m ? 'active' : ''} ${disabled ? 'opacity-30 cursor-not-allowed' : ''}"
        id="month-btn-${m}" ${disabled ? 'disabled' : ''}>
        ${m}월
      </button>
    `;
  }
}

function selectMonth(m) {
  selectedMonth = m;
  renderMonthSelector();

  const monthly = dashData?.monthly || [];
  const mData = monthly.find(d => d.month === m);
  if (!mData) return;

  const totalAll = mData.total;
  const rate = totalAll > 0 ? (mData.pass_count / totalAll * 100).toFixed(1) : '0.0';

  const area = document.getElementById('monthly-data-area');
  area.innerHTML = `
    <div class="grid grid-cols-4 gap-4 mb-6">
      <div class="card kpi-card p-4">
        <p class="text-[11px] text-gray-500 font-medium mb-1">총 체크인</p>
        <h3 class="text-xl font-black text-gray-800">${totalAll.toLocaleString()}</h3>
      </div>
      <div class="card kpi-card p-4">
        <p class="text-[11px] text-gray-500 font-medium mb-1">PASS</p>
        <h3 class="text-xl font-black text-green-600">${mData.pass_count.toLocaleString()}</h3>
      </div>
      <div class="card kpi-card p-4">
        <p class="text-[11px] text-gray-500 font-medium mb-1">FAIL</p>
        <h3 class="text-xl font-black text-red-600">${mData.fail_count.toLocaleString()}</h3>
      </div>
      <div class="card kpi-card p-4">
        <p class="text-[11px] text-gray-500 font-medium mb-1">안전 확인율</p>
        <h3 class="text-xl font-black text-blue-700">${rate}%</h3>
      </div>
    </div>
    <div class="card p-5">
      <h5 class="text-sm font-bold text-gray-800 mb-3">국적별 월간 체크인 비율</h5>
      <div style="height:260px; position:relative; display:flex; align-items:center; justify-content:center;">
        <canvas id="monthlyNationDonut"></canvas>
      </div>
      <div class="grid grid-cols-6 gap-3 mt-4" id="monthly-nation-stats"></div>
    </div>
  `;

  // 국적별 도넛 차트
  const byLang = mData.by_lang || {};
  const langKeys = LANG_ORDER.filter(l => byLang[l]);
  const nationTotals = langKeys.map(l => byLang[l]);
  const nationTotal = nationTotals.reduce((a, b) => a + b, 0) || 1;

  if (monthlyNationChartInstance) monthlyNationChartInstance.destroy();
  monthlyNationChartInstance = new Chart(document.getElementById('monthlyNationDonut'), {
    type: 'doughnut',
    data: {
      labels: langKeys.map(l => langFlag(l) + ' ' + l),
      datasets: [{ data: nationTotals, backgroundColor: langKeys.map(l => langColor(l)), borderWidth: 2, borderColor: '#fff' }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '60%',
      animation: { duration: 800 },
      plugins: { legend: { position: 'right', labels: { padding: 12, font: { size: 11, weight: 600 }, usePointStyle: true, pointStyle: 'circle' } } }
    }
  });

  // 국적별 인원 표시
  document.getElementById('monthly-nation-stats').innerHTML = langKeys.map(l => `
    <div class="nation-stat">
      <span class="text-2xl">${langFlag(l)}</span>
      <div class="flex-1">
        <div class="text-xs font-bold text-gray-800">${l}</div>
        <div class="text-[10px] text-gray-400">${(byLang[l] / nationTotal * 100).toFixed(1)}%</div>
      </div>
      <div class="text-right">
        <div class="text-lg font-black" style="color:${langColor(l)}">${byLang[l]}</div>
        <div class="text-[9px] text-gray-400 font-bold">명</div>
      </div>
    </div>
  `).join('');
}

// ════════════════════════════════════════════════════════════
// 13. 알림 페이지 (3회 실패 관리자 호출)
// ════════════════════════════════════════════════════════════

const LANG_MAP = { vi: '베트남어', zh: '중국어', km: '크메르어', th: '태국어', ko: '한국어', en: '영어' };

let notificationsData = [];
let notiFilter = 'all';
let overrideTargetSessionId = null;

async function loadNotificationBadge() {
  try {
    const pending = await api.getNotifications('pending');
    const badge = document.getElementById('fail-badge');
    if (pending.length > 0) {
      badge.textContent = pending.length;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  } catch (_) { /* 무시 */ }
}

async function loadNotifications() {
  const statusParam = notiFilter === 'all' ? null : notiFilter;
  try {
    notificationsData = await api.getNotifications(statusParam);
  } catch (err) {
    console.error('알림 조회 실패:', err.message);
    notificationsData = [];
  }
  renderNotifications();
  updateFailBadge();
}

function updateFailBadge() {
  const badge = document.getElementById('fail-badge');
  const pendingCount = notificationsData.filter(n => n.session_status === 'fail').length;
  if (pendingCount > 0) {
    badge.textContent = pendingCount;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

function renderNotifications() {
  const container = document.getElementById('notification-list');

  if (notificationsData.length === 0) {
    container.innerHTML = `
      <div class="card p-10 text-center">
        <i class="fas fa-bell-slash text-gray-200 text-5xl mb-4"></i>
        <h4 class="text-base font-bold text-gray-500">알림이 없습니다</h4>
        <p class="text-gray-400 text-xs mt-1">현재 관리자 호출 대기 중인 건이 없습니다.</p>
      </div>`;
    return;
  }

  container.innerHTML = notificationsData.map(n => {
    const isPending = n.session_status === 'fail';
    const langLabel = LANG_MAP[n.language] || n.language;
    const flag = langFlag(langLabel);
    const time = n.created_at.split('T')[1]?.slice(0, 5) || '';
    const helmetIcon = n.helmet_pass ? '<i class="fas fa-hard-hat text-green-500"></i>' : '<i class="fas fa-hard-hat text-red-500"></i>';
    const vestIcon = n.vest_pass ? '<i class="fas fa-vest text-green-500"></i>' : '<i class="fas fa-vest text-red-500"></i>';

    return `
      <div class="card p-4 mb-3 border-l-4 ${isPending ? 'border-l-red-500' : 'border-l-green-500'}">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-4">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center text-lg ${isPending ? 'bg-red-50' : 'bg-green-50'}">
              ${isPending ? '<i class="fas fa-triangle-exclamation text-red-500"></i>' : '<i class="fas fa-circle-check text-green-500"></i>'}
            </div>
            <div>
              <div class="flex items-center gap-2 mb-1">
                <span class="text-xs font-bold text-gray-800">${flag} ${langLabel}</span>
                <span class="text-[10px] text-gray-400 font-mono">${n.system_id}</span>
                ${n.group_name ? `<span class="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-bold">${n.group_name}</span>` : ''}
              </div>
              <div class="flex items-center gap-3 text-[11px] text-gray-500">
                <span>시도 ${n.attempt_count}회 모두 실패</span>
                <span>안전모 ${n.helmet_pass ? '✅' : '❌'} · 조끼 ${n.vest_pass ? '✅' : '❌'}</span>
                <span class="text-gray-400">${time}</span>
              </div>
            </div>
          </div>
          <div class="flex items-center gap-2">
            ${isPending
              ? `<span class="text-[10px] bg-red-50 text-red-600 px-2.5 py-1 rounded-full font-bold">미처리</span>
                 <button onclick="openOverrideModal(${n.session_id}, '${n.system_id}', '${flag} ${langLabel}', '${n.group_name || ''}')"
                   class="bg-green-600 hover:bg-green-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition-colors">
                   <i class="fas fa-check mr-1"></i> PASS 처리
                 </button>`
              : `<span class="text-[10px] bg-green-50 text-green-600 px-2.5 py-1 rounded-full font-bold">처리완료</span>
                 ${n.override_reason ? `<span class="text-[10px] text-gray-400 max-w-[200px] truncate" title="${n.override_reason}">사유: ${n.override_reason}</span>` : ''}`
            }
          </div>
        </div>
      </div>`;
  }).join('');
}

function filterNotifications(f) {
  notiFilter = f;
  document.querySelectorAll('[id^="noti-filter-"]').forEach(btn => btn.classList.remove('active'));
  const activeBtn = document.getElementById(`noti-filter-${f}`);
  if (activeBtn) activeBtn.classList.add('active');
  loadNotifications();
}

function openOverrideModal(sessionId, systemId, workerLabel, groupName) {
  overrideTargetSessionId = sessionId;
  document.getElementById('override-reason').value = '';
  document.getElementById('override-modal-info').innerHTML = `
    <div class="flex items-center gap-2">
      <span class="font-bold">${workerLabel}</span>
      <span class="text-gray-400 font-mono">${systemId}</span>
      ${groupName ? `<span class="bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-bold">${groupName}</span>` : ''}
    </div>`;
  const modal = document.getElementById('override-modal');
  modal.classList.remove('hidden');
  modal.style.display = 'flex';
}

function closeOverrideModal() {
  overrideTargetSessionId = null;
  const modal = document.getElementById('override-modal');
  modal.classList.add('hidden');
  modal.style.display = 'none';
}

async function confirmOverride() {
  if (!overrideTargetSessionId) return;

  const btn = document.getElementById('override-confirm-btn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> 처리 중...';

  try {
    const reason = document.getElementById('override-reason').value.trim();
    await api.overrideSession(overrideTargetSessionId, reason);
    closeOverrideModal();
    await loadNotifications();
  } catch (err) {
    alert('PASS 처리 실패: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-check mr-1"></i> PASS 처리';
  }
}

// ════════════════════════════════════════════════════════════
// 14. 그룹 관리 페이지
// ════════════════════════════════════════════════════════════

let groupsData = [];
let editingGroupId = null;  // null = 신규, number = 수정 중

async function loadGroups() {
  const container = document.getElementById('group-list-container');
  container.innerHTML = `
    <div class="card p-10 text-center">
      <i class="fas fa-spinner fa-spin text-gray-300 text-4xl mb-4"></i>
      <p class="text-gray-400 text-sm">그룹 목록을 불러오는 중...</p>
    </div>`;
  try {
    groupsData = await api.getGroups();
  } catch (err) {
    console.error('그룹 조회 실패:', err.message);
    groupsData = [];
  }
  renderGroups();
}

function renderGroups() {
  const container = document.getElementById('group-list-container');
  if (groupsData.length === 0) {
    container.innerHTML = `
      <div class="card p-10 text-center">
        <i class="fas fa-layer-group text-gray-200 text-5xl mb-4"></i>
        <h4 class="text-base font-bold text-gray-500">그룹이 없습니다</h4>
        <p class="text-gray-400 text-xs mt-1">위의 "새 그룹 추가" 버튼을 눌러 첫 그룹을 만들어보세요.</p>
      </div>`;
    return;
  }

  container.innerHTML = `
    <div class="card overflow-hidden">
      <table class="w-full text-left text-xs">
        <thead class="bg-gray-50 text-gray-400 font-bold uppercase tracking-wider">
          <tr>
            <th class="px-6 py-4">그룹명</th>
            <th class="px-6 py-4 text-center">작업자 수</th>
            <th class="px-6 py-4">생성일</th>
            <th class="px-6 py-4 text-right">관리</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-50">
          ${groupsData.map(g => `
            <tr class="trow transition-colors">
              <td class="px-6 py-4">
                <div class="flex items-center gap-3">
                  <div class="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
                    <i class="fas fa-layer-group text-blue-600 text-xs"></i>
                  </div>
                  <span class="font-bold text-gray-800">${g.name}</span>
                </div>
              </td>
              <td class="px-6 py-4 text-center">
                <span class="bg-blue-50 text-blue-700 font-bold text-xs px-2.5 py-1 rounded-full">${g.user_count}명</span>
              </td>
              <td class="px-6 py-4 text-gray-400">${(g.created_at || '').split('T')[0]}</td>
              <td class="px-6 py-4 text-right">
                <div class="flex items-center justify-end gap-2">
                  <button onclick="openGroupModal(${g.id}, '${g.name.replace(/'/g, "\\'")}')"
                    class="text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors">
                    <i class="fas fa-pen mr-1"></i> 수정
                  </button>
                  <button onclick="openGroupDeleteModal(${g.id}, '${g.name.replace(/'/g, "\\'")}', ${g.user_count})"
                    class="text-xs font-bold text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-colors">
                    <i class="fas fa-trash mr-1"></i> 삭제
                  </button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <div class="p-3 border-t border-gray-50 bg-gray-50/30 text-[10px] text-gray-400 font-bold uppercase tracking-tighter">
        총 ${groupsData.length}개 그룹
      </div>
    </div>`;
}

function openGroupModal(groupId = null, groupName = '') {
  editingGroupId = groupId;
  document.getElementById('group-modal-title').innerText = groupId ? '그룹 이름 수정' : '새 그룹 추가';
  document.getElementById('group-name-input').value = groupName;
  const modal = document.getElementById('group-modal');
  modal.style.display = 'flex';
  setTimeout(() => document.getElementById('group-name-input').focus(), 50);
}

function closeGroupModal() {
  editingGroupId = null;
  document.getElementById('group-modal').style.display = 'none';
}

async function saveGroup() {
  const name = document.getElementById('group-name-input').value.trim();
  if (!name) { document.getElementById('group-name-input').focus(); return; }

  const btn = document.getElementById('group-save-btn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> 저장 중...';

  try {
    if (editingGroupId) {
      await api.updateGroup(editingGroupId, name);
    } else {
      await api.createGroup(name);
    }
    closeGroupModal();
    await loadGroups();
  } catch (err) {
    alert('저장 실패: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-check mr-1"></i> 저장';
  }
}

let deleteTargetGroupId = null;

function openGroupDeleteModal(groupId, groupName, userCount) {
  deleteTargetGroupId = groupId;
  document.getElementById('group-delete-msg').innerText =
    userCount > 0
      ? `"${groupName}" 그룹을 삭제합니다. 소속 ${userCount}명의 그룹 배정이 해제됩니다.`
      : `"${groupName}" 그룹을 삭제합니다.`;
  document.getElementById('group-delete-modal').style.display = 'flex';
}

function closeGroupDeleteModal() {
  deleteTargetGroupId = null;
  document.getElementById('group-delete-modal').style.display = 'none';
}

async function confirmGroupDelete() {
  if (!deleteTargetGroupId) return;
  const btn = document.getElementById('group-delete-confirm-btn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> 삭제 중...';
  try {
    await api.deleteGroup(deleteTargetGroupId);
    closeGroupDeleteModal();
    await loadGroups();
  } catch (err) {
    alert('삭제 실패: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-trash mr-1"></i> 삭제';
  }
}

// 엔터키로 그룹 저장
document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('group-name-input');
  if (input) input.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveGroup(); });
});

// ════════════════════════════════════════════════════════════
// 15. 페이지 로드 진입점
// ════════════════════════════════════════════════════════════

window.addEventListener('load', () => {
  if (checkAuth()) {
    initDashboard();
  }

  // 시계
  const clockInterval = setInterval(() => {
    const clockEl = document.getElementById('clock');
    if (clockEl) {
      const now = new Date();
      const dateStr = now.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
      const timeStr = now.toLocaleTimeString('ko-KR', { hour12: true });
      clockEl.innerHTML = `
        <span class="text-gray-400 mr-2 font-medium">${dateStr}</span>
        <span class="text-gray-800 font-bold">${timeStr}</span>
      `;
    } else {
      clearInterval(clockInterval);
    }
  }, 1000);
});

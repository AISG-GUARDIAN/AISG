    // ════════════════════════════════════════════════════════════
    // 1. 공통 데이터 & 유틸리티
    // ════════════════════════════════════════════════════════════
    const flags = ["🇻🇳", "🇨🇳", "🇰🇭", "🇹🇭", "🇰🇷", "🌐"];
    const langs = ["베트남어", "중국어", "크메르어", "태국어", "한국어", "기타"];
    const nationColors = ['#F47C20','#DC2626','#CA8A04','#7C3AED','#1A56A0','#64748B'];
 
    // 시드 기반 난수 (재현 가능한 데이터)
    function seededRandom(seed) {
      let x = Math.sin(seed) * 10000;
      return x - Math.floor(x);
    }
 
    // 월별 데이터 생성 함수
    function generateMonthData(year, month) {
      const daysInMonth = new Date(year, month, 0).getDate();
      const seed = year * 100 + month;
      const data = { days: [], totalPass: 0, totalFail: 0, nations: {} };
      langs.forEach(l => data.nations[l] = 0);
 
      for (let d = 1; d <= daysInMonth; d++) {
        const daySeed = seed * 100 + d;
        const total = Math.floor(seededRandom(daySeed) * 40) + 30; // 30~70명/일
        const passRate = 0.85 + seededRandom(daySeed + 1) * 0.12; // 85~97%
        const pass = Math.round(total * passRate);
        const fail = total - pass;
        
        const dayNations = {};
        let remaining = total;
        const weights = [0.24, 0.26, 0.25, 0.20, 0.04, 0.01];
        langs.forEach((l, i) => {
          if (i === langs.length - 1) {
            dayNations[l] = remaining;
          } else {
            const n = Math.round(total * weights[i] * (0.8 + seededRandom(daySeed + i + 10) * 0.4));
            dayNations[l] = Math.min(n, remaining);
            remaining -= dayNations[l];
          }
          data.nations[l] += dayNations[l];
        });
 
        data.days.push({ day: d, total, pass, fail, nations: dayNations });
        data.totalPass += pass;
        data.totalFail += fail;
      }
      return data;
    }
 
    // ════════════════════════════════════════════════════════════
    // 2. 체크인 기록 테이블 데이터
    // ════════════════════════════════════════════════════════════
    const rawStatuses = [];
    for(let i=0; i<42; i++) rawStatuses.push("PASS");
    for(let i=0; i<8; i++) rawStatuses.push("FAIL");
 
    for (let i = rawStatuses.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [rawStatuses[i], rawStatuses[j]] = [rawStatuses[j], rawStatuses[i]];
    }
 
    const TABLE_DATA = [];
    let idCounter = 500;
 
    rawStatuses.forEach((status, index) => {
        const idx = index % 6;
        TABLE_DATA.push({
            id: `CHK-0${idCounter--}`,
            flag: flags[idx],
            lang: langs[idx],
            date: "2026-03-12",
            time: `09:${Math.floor(Math.random()*60).toString().padStart(2, '0')}:${Math.floor(Math.random()*60).toString().padStart(2, '0')}`,
            status: status
        });
    });
 
    let curFilter = 'ALL';
    let curPage = 1;
    const PER_PAGE = 8;
 
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
          <td class="px-6 py-4"><span class="font-black ${row.status==='PASS'?'text-green-600':'text-red-600'}">${row.status}</span></td>
        </tr>
      `).join('');
 
      document.getElementById('pagination-info').innerText = `SHOWING ${start + 1}-${Math.min(start + PER_PAGE, filtered.length)} OF ${filtered.length}`;
      renderPagination(totalPages);
    }
 
    function renderPagination(total) {
      const container = document.getElementById('pagination-btns');
      let html = "";
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
      if(activeBtn) activeBtn.classList.add('active');
    }
 
    // ════════════════════════════════════════════════════════════
    // 3. 네비게이션
    // ════════════════════════════════════════════════════════════
    const titleMap = {
      'dashboard': ['실시간 대시보드', '실시간 안전 모니터링 — 30초마다 자동 갱신'],
      'checkin': ['체크인 기록', '작업자 체크인 이력 조회'],
      'daily': ['일별 데이터', '2026년 일별 체크인 현황 분석'],
      'monthly': ['월별 데이터', '2026년 월별 체크인 종합 분석'],
      'alarm': ['시스템 알림', '알림 및 경고 메시지']
    };
 
    function navigate(p) {
      document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
      document.getElementById('section-'+p).classList.add('active');
      document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
      document.getElementById('nav-'+p).classList.add('active');
      document.getElementById('page-title').innerText = titleMap[p][0];
      document.getElementById('page-subtitle').innerText = titleMap[p][1];
      if (p === 'checkin') { curPage = 1; renderCheckinTable(); }
      if (p === 'daily') { renderDailyPage(); }
      if (p === 'monthly') { renderMonthSelector(); }
    }
 
    // ════════════════════════════════════════════════════════════
    // 4. 대시보드 차트
    // ════════════════════════════════════════════════════════════
    let timeBarChartInstance = null;
    const timeLabels = ['06시','07시','08시','09시','10시','11시','12시'];
    const passData = [28,82,165,210,185,142,95];
    const failData = [2,7,12,18,9,11,4];
 
    function initCharts() {
      // 도넛 차트 (언어별 분포)
      new Chart(document.getElementById('donutChart'), {
        type: 'doughnut',
        data: {
          labels: ['베트남어','중국어','크메르어','태국어','한국어','기타'],
          datasets: [{ data:[24,26,25,20,4,1], backgroundColor:['#F47C20','#DC2626','#CA8A04', '#7C3AED','#1A56A0','#64748B'], borderWidth:0 }]
        },
        options: { responsive: true, maintainAspectRatio: false, cutout:'75%', plugins:{ legend:{ display:false }} }
      });
 
      // 시간대별 바 차트
      renderTimeBarChart('all');
 
      // 언어별 FAIL 비율 도넛 차트
      new Chart(document.getElementById('failDonutChart'), {
        type: 'doughnut',
        data: {
          labels: ['🇻🇳 베트남','🇨🇳 중국','🇰🇭 캄보디아','🇹🇭 태국','🇰🇷 한국','🌐 기타'],
          datasets: [{
            data: [32, 28, 22, 18, 8, 4],
            backgroundColor: ['#F47C20','#DC2626','#CA8A04','#7C3AED','#1A56A0','#64748B'],
            borderWidth: 2,
            borderColor: '#fff'
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false, cutout: '68%',
          plugins: { legend: { display: false } }
        }
      });
 
      // 국적별 체크인 인원 현황
      renderNationStats();
    }
 
    function renderTimeBarChart(view) {
      if (timeBarChartInstance) { timeBarChartInstance.destroy(); }
 
      let datasets = [];
      if (view === 'all') {
        datasets = [
          { label:'통과 (PASS)', data: passData, backgroundColor:'#059669', borderRadius: 6, borderSkipped: false },
          { label:'실패 (FAIL)', data: failData, backgroundColor:'#DC2626', borderRadius: 6, borderSkipped: false }
        ];
      } else if (view === 'pass') {
        datasets = [
          { label:'통과 (PASS)', data: passData, backgroundColor: function(ctx) {
              const chart = ctx.chart;
              const {ctx: c, chartArea} = chart;
              if (!chartArea) return '#059669';
              const gradient = c.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
              gradient.addColorStop(0, '#10B981');
              gradient.addColorStop(1, '#059669');
              return gradient;
            }, borderRadius: 8, borderSkipped: false }
        ];
      } else {
        datasets = [
          { label:'실패 (FAIL)', data: failData, backgroundColor: function(ctx) {
              const chart = ctx.chart;
              const {ctx: c, chartArea} = chart;
              if (!chartArea) return '#DC2626';
              const gradient = c.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
              gradient.addColorStop(0, '#F87171');
              gradient.addColorStop(1, '#DC2626');
              return gradient;
            }, borderRadius: 8, borderSkipped: false }
        ];
      }
 
      timeBarChartInstance = new Chart(document.getElementById('timeBarChart'), {
        type: 'bar',
        data: { labels: timeLabels, datasets },
        options: {
          responsive: true, maintainAspectRatio: false,
          animation: { duration: 600, easing: 'easeOutQuart' },
          plugins: {
            legend: { display: view === 'all', position: 'top', labels: { usePointStyle: true, pointStyle: 'circle', padding: 16, font: { size: 11, weight: 600 } } },
            tooltip: {
              backgroundColor: '#1E293B', titleFont: { size: 12, weight: 700 }, bodyFont: { size: 11 },
              padding: 10, cornerRadius: 10, displayColors: true,
              callbacks: { label: function(ctx) { return ' ' + ctx.dataset.label + ': ' + ctx.parsed.y + '건'; } }
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
      // 버튼 상태 업데이트
      ['all','pass','fail'].forEach(v => {
        const btn = document.getElementById('chart-btn-' + v);
        btn.className = 'toggle-btn ';
        if (v === view) {
          if (v === 'all') btn.className += 'pass-active'; 
          else if (v === 'pass') btn.className += 'pass-active';
          else btn.className += 'fail-active';
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
 
    // 국적별 체크인 인원 현황 렌더
    function renderNationStats() {
      const counts = [470, 510, 490, 392, 78, 19]; // 오늘 기준 샘플 데이터
      const total = counts.reduce((a,b)=>a+b, 0);
      const container = document.getElementById('nation-stats-container');
      container.innerHTML = langs.map((lang, i) => `
        <div class="nation-stat">
          <span class="text-2xl">${flags[i]}</span>
          <div class="flex-1">
            <div class="text-xs font-bold text-gray-800">${lang}</div>
            <div class="text-[10px] text-gray-400">${(counts[i]/total*100).toFixed(1)}%</div>
          </div>
          <div class="text-right">
            <div class="text-lg font-black" style="color:${nationColors[i]}">${counts[i]}</div>
            <div class="text-[9px] text-gray-400 font-bold">명</div>
          </div>
        </div>
      `).join('');
    }
 
    // ════════════════════════════════════════════════════════════
    // 5. 일별 데이터 페이지
    // ════════════════════════════════════════════════════════════
    let dailyCurrentMonth = 3; // 3월부터 시작
    let dailyChartInstance = null;
 
    function renderDailyPage() {
      const monthData = generateMonthData(2026, dailyCurrentMonth);
      const monthName = dailyCurrentMonth + '월';
      document.getElementById('daily-title').innerText = `2026년 ${monthName} 일별 데이터`;
 
      // 버튼 상태
      document.getElementById('daily-next-btn').disabled = (dailyCurrentMonth >= 3);
      document.getElementById('daily-prev-btn').disabled = (dailyCurrentMonth <= 1);
 
      // KPI
      const totalAll = monthData.totalPass + monthData.totalFail;
      const rate = totalAll > 0 ? (monthData.totalPass / totalAll * 100).toFixed(1) : '0.0';
      document.getElementById('daily-kpi-row').innerHTML = `
        <div class="card kpi-card p-4">
          <p class="text-[11px] text-gray-500 font-medium mb-1">총 체크인</p>
          <h3 class="text-xl font-black text-gray-800">${totalAll.toLocaleString()}</h3>
        </div>
        <div class="card kpi-card p-4">
          <p class="text-[11px] text-gray-500 font-medium mb-1">PASS</p>
          <h3 class="text-xl font-black text-green-600">${monthData.totalPass.toLocaleString()}</h3>
        </div>
        <div class="card kpi-card p-4">
          <p class="text-[11px] text-gray-500 font-medium mb-1">FAIL</p>
          <h3 class="text-xl font-black text-red-600">${monthData.totalFail.toLocaleString()}</h3>
        </div>
        <div class="card kpi-card p-4">
          <p class="text-[11px] text-gray-500 font-medium mb-1">안전 확인율</p>
          <h3 class="text-xl font-black text-blue-700">${rate}%</h3>
        </div>
      `;
 
      // 일별 바 차트
      if (dailyChartInstance) dailyChartInstance.destroy();
      const ctx = document.getElementById('dailyBarChart');
      dailyChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: monthData.days.map(d => d.day + '일'),
          datasets: [
            { label: 'PASS', data: monthData.days.map(d => d.pass), backgroundColor: '#059669', borderRadius: 4, borderSkipped: false },
            { label: 'FAIL', data: monthData.days.map(d => d.fail), backgroundColor: '#DC2626', borderRadius: 4, borderSkipped: false }
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
 
      // 국적별 테이블
      const thead = document.getElementById('daily-nation-thead');
      thead.innerHTML = '<th class="px-4 py-3">날짜</th>' + langs.map(l => `<th class="px-4 py-3">${l}</th>`).join('') + '<th class="px-4 py-3">합계</th>';
 
      const tbody = document.getElementById('daily-nation-tbody');
      tbody.innerHTML = monthData.days.map(d => `
        <tr class="trow transition-colors">
          <td class="px-4 py-3 font-bold text-gray-700">${dailyCurrentMonth}/${d.day}</td>
          ${langs.map(l => `<td class="px-4 py-3 text-center font-medium text-gray-600">${d.nations[l]}</td>`).join('')}
          <td class="px-4 py-3 text-center font-black text-gray-800">${d.total}</td>
        </tr>
      `).join('');
    }
 
    function changeDailyMonth(delta) {
      const newMonth = dailyCurrentMonth + delta;
      if (newMonth < 1 || newMonth > 3) return;
      dailyCurrentMonth = newMonth;
      renderDailyPage();
    }
 
    // ════════════════════════════════════════════════════════════
    // 6. 월별 데이터 페이지
    // ════════════════════════════════════════════════════════════
    let selectedMonth = null;
    let monthlyChartInstance = null;
    let monthlyNationChartInstance = null;
 
    function renderMonthSelector() {
      const container = document.getElementById('month-selector');
      container.innerHTML = '';
      for (let m = 1; m <= 12; m++) {
        const isFuture = m > 3; // 3월까지만 데이터 있음
        container.innerHTML += `
          <button onclick="${isFuture ? '' : 'selectMonth('+m+')'}" 
            class="month-btn ${selectedMonth === m ? 'active' : ''} ${isFuture ? 'opacity-30 cursor-not-allowed' : ''}" 
            id="month-btn-${m}" ${isFuture ? 'disabled' : ''}>
            ${m}월
          </button>
        `;
      }
    }
 
    function selectMonth(m) {
      selectedMonth = m;
      renderMonthSelector();
      const monthData = generateMonthData(2026, m);
      const totalAll = monthData.totalPass + monthData.totalFail;
      const rate = totalAll > 0 ? (monthData.totalPass / totalAll * 100).toFixed(1) : '0.0';
 
      const area = document.getElementById('monthly-data-area');
      area.innerHTML = `
        <div class="grid grid-cols-4 gap-4 mb-6">
          <div class="card kpi-card p-4">
            <p class="text-[11px] text-gray-500 font-medium mb-1">총 체크인</p>
            <h3 class="text-xl font-black text-gray-800">${totalAll.toLocaleString()}</h3>
          </div>
          <div class="card kpi-card p-4">
            <p class="text-[11px] text-gray-500 font-medium mb-1">PASS</p>
            <h3 class="text-xl font-black text-green-600">${monthData.totalPass.toLocaleString()}</h3>
          </div>
          <div class="card kpi-card p-4">
            <p class="text-[11px] text-gray-500 font-medium mb-1">FAIL</p>
            <h3 class="text-xl font-black text-red-600">${monthData.totalFail.toLocaleString()}</h3>
          </div>
          <div class="card kpi-card p-4">
            <p class="text-[11px] text-gray-500 font-medium mb-1">안전 확인율</p>
            <h3 class="text-xl font-black text-blue-700">${rate}%</h3>
          </div>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:18px; margin-bottom:20px;">
          <div class="card p-5">
            <h5 class="text-sm font-bold text-gray-800 mb-3">일별 PASS / FAIL 추이</h5>
            <div style="height:260px; position:relative;"><canvas id="monthlyLineChart"></canvas></div>
          </div>
          <div class="card p-5">
            <h5 class="text-sm font-bold text-gray-800 mb-3">국적별 체크인 비율</h5>
            <div style="height:260px; position:relative;"><canvas id="monthlyNationDonut"></canvas></div>
          </div>
        </div>
        <div class="card p-5">
          <h5 class="text-sm font-bold text-gray-800 mb-3">국적별 월간 체크인 인원</h5>
          <div class="grid grid-cols-6 gap-3" id="monthly-nation-stats"></div>
        </div>
      `;
 
      // 라인 차트
      if (monthlyChartInstance) monthlyChartInstance.destroy();
      monthlyChartInstance = new Chart(document.getElementById('monthlyLineChart'), {
        type: 'line',
        data: {
          labels: monthData.days.map(d => d.day + '일'),
          datasets: [
            {
              label: 'PASS', data: monthData.days.map(d => d.pass),
              borderColor: '#059669', backgroundColor: 'rgba(5,150,105,0.1)',
              fill: true, tension: 0.4, borderWidth: 2.5, pointRadius: 0, pointHoverRadius: 5
            },
            {
              label: 'FAIL', data: monthData.days.map(d => d.fail),
              borderColor: '#DC2626', backgroundColor: 'rgba(220,38,38,0.1)',
              fill: true, tension: 0.4, borderWidth: 2.5, pointRadius: 0, pointHoverRadius: 5
            }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          animation: { duration: 800, easing: 'easeOutQuart' },
          plugins: {
            legend: { position: 'top', labels: { usePointStyle: true, pointStyle: 'circle', padding: 16, font: { size: 11, weight: 600 } } },
            tooltip: { mode: 'index', intersect: false, backgroundColor: '#1E293B', cornerRadius: 10 }
          },
          scales: {
            x: { grid: { display: false }, ticks: { font: { size: 9 }, color: '#9CA3AF', maxTicksLimit: 15 } },
            y: { grid: { color: '#F3F4F6' }, ticks: { font: { size: 10 }, color: '#9CA3AF' }, beginAtZero: true }
          },
          interaction: { mode: 'nearest', axis: 'x', intersect: false }
        }
      });
 
      // 국적별 도넛 차트
      const nationTotals = langs.map(l => monthData.nations[l]);
      if (monthlyNationChartInstance) monthlyNationChartInstance.destroy();
      monthlyNationChartInstance = new Chart(document.getElementById('monthlyNationDonut'), {
        type: 'doughnut',
        data: {
          labels: langs.map((l,i) => flags[i] + ' ' + l),
          datasets: [{ data: nationTotals, backgroundColor: nationColors, borderWidth: 2, borderColor: '#fff' }]
        },
        options: {
          responsive: true, maintainAspectRatio: false, cutout: '60%',
          animation: { duration: 800 },
          plugins: { legend: { position: 'right', labels: { padding: 12, font: { size: 11, weight: 600 }, usePointStyle: true, pointStyle: 'circle' } } }
        }
      });
 
      // 국적별 인원 표시
      const nationStatsEl = document.getElementById('monthly-nation-stats');
      const nationTotal = nationTotals.reduce((a,b) => a+b, 0);
      nationStatsEl.innerHTML = langs.map((lang, i) => `
        <div class="nation-stat">
          <span class="text-2xl">${flags[i]}</span>
          <div class="flex-1">
            <div class="text-xs font-bold text-gray-800">${lang}</div>
            <div class="text-[10px] text-gray-400">${(nationTotals[i]/nationTotal*100).toFixed(1)}%</div>
          </div>
          <div class="text-right">
            <div class="text-lg font-black" style="color:${nationColors[i]}">${nationTotals[i]}</div>
            <div class="text-[9px] text-gray-400 font-bold">명</div>
          </div>
        </div>
      `).join('');
    }

// 화면의 모든 ID에 데이터를 꽂아주는 함수
function updateDashboardKPI(data) {
    // 1. 큰 숫자들
    if(document.getElementById('kpi-safety-rate')) document.getElementById('kpi-safety-rate').innerText = data.safetyRate + '%';
    if(document.getElementById('kpi-total-pass')) document.getElementById('kpi-total-pass').innerText = data.totalPass.toLocaleString();
    if(document.getElementById('kpi-total-fail')) document.getElementById('kpi-total-fail').innerText = data.totalFail.toLocaleString();
    if(document.getElementById('kpi-pending')) document.getElementById('kpi-pending').innerText = data.pendingCount;

    // 2. 하단 요약문
    if(document.getElementById('total-summary-count')) {
        document.getElementById('total-summary-count').innerText = data.totalAll.toLocaleString() + '건';
    }
    if(document.getElementById('total-summary-rate')) {
        document.getElementById('total-summary-rate').innerText = data.safetyRate + '% PASS';
    }

    // 3. 막대 그래프(Progress Bar) 너비
    if(document.getElementById('kpi-safety-bar')) document.getElementById('kpi-safety-bar').style.width = data.safetyRate + '%';
    if(document.getElementById('kpi-pass-bar')) document.getElementById('kpi-pass-bar').style.width = data.passRate + '%';
    if(document.getElementById('kpi-fail-bar')) document.getElementById('kpi-fail-bar').style.width = data.failRate + '%';
    if(document.getElementById('kpi-pending-bar')) document.getElementById('kpi-pending-bar').style.width = data.pendingRate + '%';

    // 4. 트렌드 텍스트들
    if(document.getElementById('kpi-safety-trend')) {
        document.getElementById('kpi-safety-trend').innerText = '↑ 어제 대비 ' + data.safetyTrend + '%';
    }
    if(document.getElementById('kpi-pass-trend')) {
        document.getElementById('kpi-pass-trend').innerText = '↑ 지난 1시간 +' + data.passTrend + '건';
    }
    if(document.getElementById('kpi-fail-trend')) {
        document.getElementById('kpi-fail-trend').innerText = '↗ 지난 1시간 +' + data.failTrend + '건';
    }
    if(document.getElementById('kpi-pending-trend')) {
        document.getElementById('kpi-pending-trend').innerText = '↗ 긴급 ' + data.pendingTrend + '건';
    }
}

// 가짜 데이터 (백엔드에서 데이터가 오면 이 숫자들로 바꿔라.)
const currentStats = {
    safetyRate: 94.2,      // 안전 확인율 (%)
    totalPass: 1847,       // 통과 건수
    totalFail: 112,        // 실패 건수
    pendingCount: 43,      // 대기 건수
    totalAll: 1959,        // 전체 합계
    passRate: 82,          // 통과 막대 너비 (%)
    failRate: 35,          // 실패 막대 너비 (%)
    pendingRate: 45,       // 대기 막대 너비 (%)
    safetyTrend: 1.4,      // 어제 대비 변동
    passTrend: 83,         // 통과 트렌드 숫자
    failTrend: 5,           // 실패 트렌드 숫자
    pendingTrend: 12,
};

// 페이지가 다 열리면(Load) 자동으로 실행되게..
window.addEventListener('load', () => {
  // 1) 차트를 먼저 초기화
  if (typeof initCharts === 'function') {
    initCharts();
  }

  // 2) KPI 숫자들을 채워넣는다
  updateDashboardKPI(currentStats);

  // 3) 시계와 날짜를 동시에 업데이트
  const clockInterval = setInterval(() => {
    const clockEl = document.getElementById('clock');

    if (clockEl) {
      const now = new Date();

      // [날짜 포맷] 2026년 3월 13일
      const dateStr = now.toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });

      // [시간 포맷] 오전/오후 1:10:42
      const timeStr = now.toLocaleTimeString('ko-KR', {
        hour12: true
      });

      // [HTML 형식으로 넣기] 날짜와 시간의 스타일을 다르게 적용
      clockEl.innerHTML = `
        <span class="text-gray-400 mr-2 font-medium">${dateStr}</span>
        <span class="text-gray-800 font-bold">${timeStr}</span>
      `;
    } else {
      // 화면에 시계가 없으면 메모리 절약을 위해 정지
      clearInterval(clockInterval);
    }
  }, 1000);
});
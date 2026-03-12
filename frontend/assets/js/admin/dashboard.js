(async () => {
  const stats = await apiFetch("/admin/stats?period=daily");
  document.getElementById("statsCards").innerHTML =
    `<p>전체: ${stats.total} | 통과: ${stats.passed} | 불통: ${stats.failed}</p>`;
  renderBarChart("statsChart", ["통과", "불통"], [stats.passed, stats.failed], "오늘 현황");
})();

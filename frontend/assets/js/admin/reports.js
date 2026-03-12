document.getElementById("generateBtn")?.addEventListener("click", async () => {
  const period = document.getElementById("period").value;
  await apiFetch("/admin/reports/", { method: "POST", body: JSON.stringify({ period }) });
  alert("보고서 생성 중...");
});

(async () => {
  const reports = await apiFetch("/admin/reports/");
  document.getElementById("reportList").innerHTML =
    reports.map((r) => `<div><b>${r.period}</b> ${r.created_at}<br>${r.content || "생성 중"}</div>`).join("<hr>");
})();

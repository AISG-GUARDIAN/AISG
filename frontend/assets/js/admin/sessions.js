(async () => {
  const sessions = await apiFetch("/admin/sessions/");
  document.getElementById("sessionList").innerHTML =
    sessions.map((s) => `<div>세션 ${s.id} — ${s.passed ? "통과" : "불통"}</div>`).join("");
})();

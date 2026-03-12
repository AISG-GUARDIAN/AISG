(async () => {
  const users = await apiFetch("/admin/users/");
  document.getElementById("userList").innerHTML =
    users.map((u) => `<div>${u.system_id} — ${u.name}</div>`).join("");
})();

document.getElementById("importBtn")?.addEventListener("click", async () => {
  const file = document.getElementById("excelFile").files[0];
  if (!file) return;
  const form = new FormData();
  form.append("file", file);
  const token = localStorage.getItem("token");
  const res = await fetch("/admin/users/import", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const data = await res.json();
  alert(`${data.imported}명 등록 완료`);
});

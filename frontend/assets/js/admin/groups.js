(async () => {
  const groups = await apiFetch("/admin/groups/");
  document.getElementById("groupList").innerHTML =
    groups.map((g) => `<div>${g.id}. ${g.name}</div>`).join("");
})();

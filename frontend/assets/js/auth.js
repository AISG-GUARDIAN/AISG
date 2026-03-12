document.getElementById("loginForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const username = document.getElementById("username")?.value || document.getElementById("systemId")?.value;
  const password = document.getElementById("password")?.value || username;
  try {
    const data = await apiFetch("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    localStorage.setItem("token", data.access_token);
    localStorage.setItem("role", data.role);
    location.href = data.role === "admin" ? "/admin/dashboard.html" : "/user/checkin.html";
  } catch {
    alert("로그인 실패");
  }
});

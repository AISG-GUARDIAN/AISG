function renderBarChart(canvasId, labels, data, label) {
  const ctx = document.getElementById(canvasId)?.getContext("2d");
  if (!ctx) return;
  new Chart(ctx, {
    type: "bar",
    data: { labels, datasets: [{ label, data, backgroundColor: "#1976d2" }] },
    options: { responsive: true },
  });
}

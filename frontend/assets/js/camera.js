const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const captureBtn = document.getElementById("captureBtn");
const result = document.getElementById("result");

navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
  .then((stream) => { video.srcObject = stream; })
  .catch(() => alert("카메라 접근 불가"));

captureBtn?.addEventListener("click", async () => {
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d").drawImage(video, 0, 0);
  canvas.toBlob(async (blob) => {
    const form = new FormData();
    form.append("file", blob, "capture.jpg");
    const token = localStorage.getItem("token");
    const res = await fetch("/user/checkin", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const data = await res.json();
    result.textContent = data.passed ? "통과" : "불통 — 안전장비를 착용해주세요";
    result.style.color = data.passed ? "#4caf50" : "#f44336";
  }, "image/jpeg");
});

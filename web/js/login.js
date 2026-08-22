import { apiRequest } from "./api.js";

const form = document.getElementById("login-form");
const errorMsg = document.getElementById("error-msg");
const submitBtn = document.getElementById("submit-btn");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorMsg.textContent = "";
  submitBtn.disabled = true;
  submitBtn.textContent = "ログイン中...";

  const operatorId = document.getElementById("operatorId").value.trim();
  const password = document.getElementById("password").value;

  try {
    await apiRequest("/auth/login", { method: "POST", body: { operatorId, password } });
    window.location.href = "/portal.html";
  } catch (err) {
    errorMsg.textContent = err.message;
    submitBtn.disabled = false;
    submitBtn.textContent = "ログイン";
  }
});

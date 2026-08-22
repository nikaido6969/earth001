export async function apiRequest(path, { method = "GET", body, isForm = false } = {}) {
  const opts = { method, credentials: "include", headers: {} };
  if (body && !isForm) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  } else if (body && isForm) {
    opts.body = body;
  }
  const res = await fetch(`/api${path}`, opts);
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const message = data?.error || `通信エラーが発生しました (${res.status})`;
    throw new Error(message);
  }
  return data;
}

export function showToast(message, ms = 2600) {
  let toast = document.querySelector(".toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove("show"), ms);
}

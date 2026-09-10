const AUTH_KEY = "awb-auth";
const CREDENTIAL_HASH =
  "4dcaa92c01008dd30fa65408b02c8b400a00e6c6f20065fbf3be39c908c4ed20";

async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const buffer = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function enterSite() {
  sessionStorage.setItem(AUTH_KEY, "1");
  document.documentElement.classList.add("is-authed");
  document.getElementById("app").hidden = false;
  document.getElementById("gate").hidden = true;
}

function leaveSite() {
  sessionStorage.removeItem(AUTH_KEY);
  document.documentElement.classList.remove("is-authed");
  document.getElementById("app").hidden = true;
  document.getElementById("gate").hidden = false;
}

const form = document.getElementById("login-form");
const errorEl = document.getElementById("login-error");
const logout = document.getElementById("logout");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorEl.textContent = "";

  const account = document.getElementById("account").value.trim();
  const password = document.getElementById("password").value;
  const hash = await sha256(`${account}:${password}`);

  if (hash === CREDENTIAL_HASH) {
    enterSite();
    form.reset();
    return;
  }

  errorEl.textContent = "帳號或密碼不正確。";
});

logout.addEventListener("click", () => {
  leaveSite();
  document.getElementById("account").focus();
});

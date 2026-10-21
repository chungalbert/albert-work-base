const CREDENTIAL_MESSAGE = "帳號或密碼不正確。";
const NETWORK_MESSAGE = "無法連上伺服器。這不是密碼錯誤，請改用家用 Wi-Fi 或稍後再試。";

type FailureLike = {
  message?: string;
  name?: string;
  status?: number;
};

export function isTransportFailure(error: unknown, status?: number): boolean {
  if (status === 0 || (typeof status === "number" && status >= 500)) return true;
  if (!error || typeof error !== "object") return false;
  const candidate = error as FailureLike;
  if (candidate.status === 0 || (typeof candidate.status === "number" && candidate.status >= 500)) {
    return true;
  }
  if (candidate.name === "AuthRetryableFetchError") return true;
  const message = (candidate.message ?? "").toLowerCase();
  return (
    message.includes("failed to fetch") ||
    message.includes("load failed") ||
    message.includes("networkerror") ||
    message.includes("network request failed") ||
    message.includes("fetcherror") ||
    message.includes("econnreset")
  );
}

export function credentialOrTransportMessage(error: unknown, status?: number): string {
  if (isTransportFailure(error, status)) return NETWORK_MESSAGE;
  return CREDENTIAL_MESSAGE;
}

export { CREDENTIAL_MESSAGE, NETWORK_MESSAGE };

import * as OTPAuth from "otpauth";

export type ParsedOtpInput = {
  secret: string;
  issuer: string;
  account: string;
  label: string;
  qr_text?: string;
  period: number;
  digits: number;
};

/** Remaining seconds in the current TOTP window. */
export function totpRemaining(period = 30, now = Date.now()): number {
  const elapsed = Math.floor(now / 1000) % period;
  return period - elapsed;
}

export function generateTotp(secretBase32: string, period = 30, digits = 6): string {
  const totp = new OTPAuth.TOTP({
    algorithm: "SHA1",
    digits,
    period,
    secret: OTPAuth.Secret.fromBase32(secretBase32.replace(/\s+/g, "").toUpperCase()),
  });
  return totp.generate();
}

/**
 * Accept raw Base32 secret or otpauth://totp/... URI.
 * Throws on invalid input.
 */
export function parseOtpInput(raw: string): ParsedOtpInput {
  const text = raw.trim();
  if (!text) throw new Error("Paste a Base32 secret or otpauth:// URI.");

  if (/^otpauth:\/\//i.test(text)) {
    const parsed = OTPAuth.URI.parse(text);
    if (!(parsed instanceof OTPAuth.TOTP)) {
      throw new Error("Only TOTP otpauth URIs are supported.");
    }
    const issuer = (parsed.issuer ?? "").trim();
    const account = (parsed.label ?? "").trim();
    const secret = parsed.secret.base32;
    return {
      secret,
      issuer,
      account,
      label: issuer && account ? `${issuer} · ${account}` : issuer || account || "OTP entry",
      qr_text: text,
      period: parsed.period || 30,
      digits: parsed.digits || 6,
    };
  }

  const secret = text.replace(/\s+/g, "").toUpperCase();
  // Validate by attempting encode/decode via otpauth
  try {
    OTPAuth.Secret.fromBase32(secret);
  } catch {
    throw new Error("Invalid Base32 secret.");
  }
  return {
    secret,
    issuer: "",
    account: "",
    label: "OTP entry",
    period: 30,
    digits: 6,
  };
}

export function formatCode(code: string): string {
  if (code.length === 6) return `${code.slice(0, 3)} ${code.slice(3)}`;
  return code;
}

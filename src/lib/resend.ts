import { Resend } from "resend";

let resend: Resend | null = null;

export function getResend() {
  if (!resend) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error("RESEND_API_KEY is not configured.");
    }
    resend = new Resend(apiKey);
  }

  return resend;
}

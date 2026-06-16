import { Resend } from "resend";

let resend: Resend | null = null;

function getResend() {
  if (!resend) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error("RESEND_API_KEY is not configured.");
    resend = new Resend(apiKey);
  }
  return resend;
}

function fromEmail() {
  return process.env.OTP_FROM_EMAIL ?? "Onboard Tours CRM <onboarding@resend.dev>";
}

export async function sendOtpEmail(email: string, otp: string) {
  const { error } = await getResend().emails.send({
    from: fromEmail(),
    to: email,
    subject: "Your Onboard Tours CRM login code",
    html: `<div style="background:#09090b;color:#fafafa;font-family:Arial,sans-serif;padding:32px"><div style="max-width:560px;margin:auto;border:1px solid #27272a;border-radius:14px;padding:28px"><h1 style="color:#e8003d;margin:0 0 12px">Onboard CRM</h1><p>Use this one-time code to continue signing in.</p><div style="font-size:34px;letter-spacing:10px;font-weight:800;color:#e8003d;margin:26px 0">${otp}</div><p style="color:#a1a1aa">This code expires in 10 minutes.</p></div></div>`,
  });
  if (error) throw new Error(error.message);
}

export async function sendProfileResetOtpEmail(email: string, profileName: string, otp: string) {
  const { error } = await getResend().emails.send({
    from: fromEmail(),
    to: email,
    subject: `Reset profile password for ${profileName}`,
    html: `<div style="background:#09090b;color:#fafafa;font-family:Arial,sans-serif;padding:32px"><div style="max-width:560px;margin:auto;border:1px solid #27272a;border-radius:14px;padding:28px"><h1 style="color:#e8003d;margin:0 0 12px">Onboard CRM</h1><p>Use this one-time code to reset <strong>${profileName}</strong>.</p><div style="font-size:34px;letter-spacing:10px;font-weight:800;color:#e8003d;margin:26px 0">${otp}</div><p style="color:#a1a1aa">This code expires in 10 minutes.</p></div></div>`,
  });
  if (error) throw new Error(error.message);
}

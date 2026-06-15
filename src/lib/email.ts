import "server-only";

import { getResend } from "@/lib/resend";

export async function sendOtpEmail(email: string, otp: string) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://onboard-crm.com";
  const from = process.env.OTP_FROM_EMAIL ?? "Onboard Tours CRM <onboarding@resend.dev>";

  const { error } = await getResend().emails.send({
    from,
    to: email,
    subject: "Your Onboard Tours CRM login code",
    html: `
      <div style="background:#050505;color:#ffffff;font-family:Arial,sans-serif;padding:32px">
        <div style="max-width:560px;margin:auto;border:1px solid #2a2a2a;border-radius:16px;padding:28px">
          <h1 style="color:#ef174b;margin:0 0 12px">Onboard Tours CRM</h1>
          <p style="font-size:16px;line-height:1.6">Use this one-time code to continue signing in.</p>
          <div style="font-size:34px;letter-spacing:10px;font-weight:800;color:#ef174b;margin:28px 0">${otp}</div>
          <p style="color:#b5b5b5">This code expires in 10 minutes. If you did not request it, you can ignore this email.</p>
          <p style="color:#777;font-size:13px">App: ${appUrl}</p>
        </div>
      </div>
    `,
  });

  if (error) {
    throw new Error(error.message);
  }
}

import "server-only";

// Transactional email through Resend's HTTP API. Without RESEND_API_KEY and
// EMAIL_FROM the account-recovery features stay switched off in production; in
// development the message is printed to the server console instead.
export const emailConfigured = () =>
  Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);

export const emailAvailable = () =>
  emailConfigured() || process.env.NODE_ENV !== "production";

const escape = (value: string) =>
  value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

export function emailTemplate({ heading, body, action, url }: {
  heading: string;
  body: string;
  action: string;
  url: string;
}) {
  const html = `<!doctype html><html><body style="margin:0;background:#f5f5f5;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1a1a1a">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="480" cellspacing="0" cellpadding="0" style="max-width:480px;background:#ffffff;border:1px solid #e0e0e0;border-radius:14px"><tr><td style="padding:32px">
<p style="margin:0 0 18px;font-weight:700;font-size:18px">MyPisara</p>
<h1 style="margin:0 0 12px;font-size:20px">${escape(heading)}</h1>
<p style="margin:0 0 24px;line-height:1.5;color:#4d4d4d">${escape(body)}</p>
<p style="margin:0 0 24px"><a href="${escape(url)}" style="display:inline-block;padding:12px 20px;border-radius:9px;background:#1a1a1a;color:#ffffff;text-decoration:none;font-weight:600">${escape(action)}</a></p>
<p style="margin:0;font-size:12px;line-height:1.5;color:#6b6b6b">If the button doesn't work, paste this link into your browser:<br>${escape(url)}</p>
<p style="margin:18px 0 0;font-size:12px;color:#6b6b6b">If you didn't ask for this, you can ignore this email.</p>
</td></tr></table></td></tr></table></body></html>`;
  const text = `${heading}\n\n${body}\n\n${action}: ${url}\n\nIf you didn't ask for this, you can ignore this email.`;
  return { html, text };
}

export async function sendEmail(message: {
  to: string;
  subject: string;
  html: string;
  text: string;
}) {
  if (!emailConfigured()) {
    if (process.env.NODE_ENV === "production")
      throw new Error("Email is not configured.");
    console.info(`\n[email → ${message.to}] ${message.subject}\n${message.text}\n`);
    return;
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    }),
  });
  if (!response.ok)
    throw new Error(`Email provider rejected the message (${response.status}).`);
}

import nodemailer from "nodemailer";

type SendRegistrationCodeInput = {
  toEmail: string;
  fullName: string;
  code: string;
  expiresMinutes: number;
};

export type SendRegistrationCodeResult = {
  sent: boolean;
  provider: "smtp" | "resend" | "console" | "none";
  error?: string;
  devCode?: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function registrationEmailText(input: SendRegistrationCodeInput): string {
  return [
    `Xin chào ${input.fullName},`,
    "",
    "Bạn vừa đăng ký tài khoản HUST x Troy IT Campus Portal.",
    `Mã xác minh của bạn là: ${input.code}`,
    `Mã có hiệu lực trong ${input.expiresMinutes} phút.`,
    "",
    "Nếu bạn không thực hiện thao tác này, vui lòng bỏ qua email.",
  ].join("\n");
}

function registrationEmailHtml(input: SendRegistrationCodeInput): string {
  const fullName = escapeHtml(input.fullName);
  return [
    `<p>Xin chào <strong>${fullName}</strong>,</p>`,
    "<p>Bạn vừa đăng ký tài khoản <strong>HUST x Troy IT Campus Portal</strong>.</p>",
    `<p>Mã xác minh của bạn: <span style="font-size: 22px; font-weight: 700; letter-spacing: 0.12em;">${input.code}</span></p>`,
    `<p>Mã có hiệu lực trong <strong>${input.expiresMinutes} phút</strong>.</p>`,
    "<p>Nếu bạn không thực hiện thao tác này, vui lòng bỏ qua email.</p>",
  ].join("");
}

function parseBoolean(value: string | undefined, fallback = false): boolean {
  if (!value) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

async function sendWithSmtp(
  input: SendRegistrationCodeInput,
): Promise<SendRegistrationCodeResult | null> {
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpService = process.env.SMTP_SERVICE;
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = Number.parseInt(process.env.SMTP_PORT ?? "587", 10);
  const smtpSecure = parseBoolean(process.env.SMTP_SECURE, smtpPort === 465);
  const smtpFromEmail =
    process.env.SMTP_FROM_EMAIL ?? process.env.MAIL_FROM ?? smtpUser ?? "";

  if (!smtpUser || !smtpPass || !smtpFromEmail) {
    return null;
  }

  if (!smtpService && !smtpHost) {
    return {
      sent: false,
      provider: "smtp",
      error: "SMTP is missing SMTP_HOST (or SMTP_SERVICE).",
    };
  }

  try {
    const transporter = nodemailer.createTransport(
      smtpService
        ? {
            service: smtpService,
            auth: {
              user: smtpUser,
              pass: smtpPass,
            },
          }
        : {
            host: smtpHost,
            port: Number.isFinite(smtpPort) ? smtpPort : 587,
            secure: smtpSecure,
            auth: {
              user: smtpUser,
              pass: smtpPass,
            },
          },
    );

    await transporter.sendMail({
      from: smtpFromEmail,
      to: input.toEmail,
      subject: "Ma xac minh dang ky HUST Portal",
      text: registrationEmailText(input),
      html: registrationEmailHtml(input),
    });

    return {
      sent: true,
      provider: "smtp",
    };
  } catch (error) {
    return {
      sent: false,
      provider: "smtp",
      error: error instanceof Error ? error.message : "Cannot connect to SMTP server.",
    };
  }
}

async function sendWithResend(
  input: SendRegistrationCodeInput,
): Promise<SendRegistrationCodeResult | null> {
  const resendApiKey = process.env.RESEND_API_KEY;
  const resendFromEmail = process.env.RESEND_FROM_EMAIL ?? process.env.MAIL_FROM;
  if (!resendApiKey || !resendFromEmail) {
    return null;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: resendFromEmail,
        to: [input.toEmail],
        subject: "Ma xac minh dang ky HUST Portal",
        text: registrationEmailText(input),
        html: registrationEmailHtml(input),
      }),
    });

    if (!response.ok) {
      const reason = await response.text();
      return {
        sent: false,
        provider: "resend",
        error: reason || "Resend API returned an error.",
      };
    }

    return {
      sent: true,
      provider: "resend",
    };
  } catch (error) {
    return {
      sent: false,
      provider: "resend",
      error: error instanceof Error ? error.message : "Cannot connect to Resend API.",
    };
  }
}

export async function sendRegistrationVerificationCode(
  input: SendRegistrationCodeInput,
): Promise<SendRegistrationCodeResult> {
  const smtpResult = await sendWithSmtp(input);
  if (smtpResult?.sent) {
    return smtpResult;
  }

  const resendResult = await sendWithResend(input);
  if (resendResult?.sent) {
    return resendResult;
  }

  if (process.env.NODE_ENV !== "production") {
    console.info(`[auth] Registration verification code for ${input.toEmail}: ${input.code}`);
    return {
      sent: true,
      provider: "console",
      devCode: input.code,
    };
  }

  return {
    sent: false,
    provider: "none",
    error:
      smtpResult?.error ??
      resendResult?.error ??
      "Email service is not configured. Set SMTP_* (recommended) or RESEND_API_KEY/RESEND_FROM_EMAIL.",
  };
}

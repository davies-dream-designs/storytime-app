import { Resend } from "resend";

function getClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return new Resend(apiKey);
}

export async function sendBookReadyEmail(input: {
  toEmail: string;
  toName: string;
  storyTitle: string;
  bookId: string;
  appUrl: string;
}): Promise<void> {
  const client = getClient();
  if (!client) return;

  const { toEmail, toName, storyTitle, bookId, appUrl } = input;
  const bookUrl = `${appUrl}/books/${bookId}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#f5f0e8;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f0e8;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">

          <!-- Header -->
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <span style="font-size:28px;font-weight:700;color:#2b2060;letter-spacing:-0.5px;">🌙 Storycot</span>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background:#ffffff;border-radius:20px;padding:40px 36px;box-shadow:0 2px 12px rgba(0,0,0,0.06);">

              <p style="margin:0 0 8px;font-size:13px;font-weight:600;letter-spacing:0.08em;color:#9b96b8;text-transform:uppercase;">Your illustrated book is ready</p>
              <h1 style="margin:0 0 16px;font-size:26px;font-weight:700;color:#1a1635;line-height:1.25;">${storyTitle}</h1>

              <p style="margin:0 0 28px;font-size:15px;color:#4a4870;line-height:1.6;">
                Hi ${toName}, the illustrations are done and your personalised storybook is waiting for you. Tap the button below to view it, download the PDF, or order a printed copy.
              </p>

              <!-- CTA -->
              <table cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center">
                    <a href="${bookUrl}"
                       style="display:inline-block;background:#2b2060;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 36px;border-radius:100px;">
                      View My Book ✨
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:28px 0 0;font-size:13px;color:#9b96b8;text-align:center;line-height:1.5;">
                Or copy this link into your browser:<br />
                <a href="${bookUrl}" style="color:#7c6fe0;">${bookUrl}</a>
              </p>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top:24px;">
              <p style="margin:0;font-size:12px;color:#b0acce;">
                You're receiving this because you created a book on
                <a href="${appUrl}" style="color:#7c6fe0;">storycot.com</a>.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `Hi ${toName}, your illustrated storybook "${storyTitle}" is ready!\n\nView it here: ${bookUrl}\n\n— The Storycot Team`;

  await client.emails.send({
    from: "Storycot <noreply@storycot.com>",
    to: toEmail,
    subject: `✨ Your book is ready — ${storyTitle}`,
    html,
    text,
  });
}

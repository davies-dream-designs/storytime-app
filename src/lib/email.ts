import { Resend } from "resend";

function getClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return new Resend(apiKey);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function getOriginUrl(appUrl: string): string {
  try {
    return new URL(appUrl).origin;
  } catch {
    return appUrl.replace(/\/+$/, "");
  }
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
  const bookUrl = joinUrl(appUrl, `/books/${bookId}`);
  const logoUrl = joinUrl(getOriginUrl(appUrl), "/nav-icon-light.png");
  const safeName = escapeHtml(toName);
  const safeStoryTitle = escapeHtml(storyTitle);
  const safeBookUrl = escapeHtml(bookUrl);
  const safeAppUrl = escapeHtml(appUrl);
  const safeLogoUrl = escapeHtml(logoUrl);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#fdf6ee;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#fdf6ee;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

          <!-- Header -->
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <table cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td style="padding-right:10px;">
                    <img src="${safeLogoUrl}" width="36" height="36" alt="" style="display:block;border-radius:10px;" />
                  </td>
                  <td style="font-size:30px;font-weight:800;color:#2d2058;letter-spacing:-0.4px;">
                    Storycot
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background:#ffffff;border:1px solid #ede9fe;border-radius:18px;padding:40px 36px;box-shadow:0 14px 34px rgba(45,32,88,0.08);">

              <p style="margin:0 0 8px;font-size:13px;font-weight:800;letter-spacing:0.08em;color:#7c3aed;text-transform:uppercase;">Your illustrated book is ready</p>
              <h1 style="margin:0 0 16px;font-size:30px;font-weight:800;color:#1e1344;line-height:1.18;">${safeStoryTitle}</h1>

              <p style="margin:0 0 28px;font-size:16px;color:#5b4e8a;line-height:1.65;">
                Hi ${safeName}, the illustrations are done and your personalised Storycot book is waiting for you. Open it to review the art, download the PDF or EPUB, or prepare it for print.
              </p>

              <!-- CTA -->
              <table cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center">
                    <a href="${safeBookUrl}"
                       style="display:inline-block;background:#2d2058;color:#fef9c3;text-decoration:none;font-size:15px;font-weight:800;padding:15px 36px;border-radius:100px;">
                      Open my book
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:28px 0 0;font-size:13px;color:#7c6dc8;text-align:center;line-height:1.5;">
                Or copy this link into your browser:<br />
                <a href="${safeBookUrl}" style="color:#7c3aed;">${safeBookUrl}</a>
              </p>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top:24px;">
              <p style="margin:0;font-size:12px;color:#7c6dc8;">
                You're receiving this because you created a book on
                <a href="${safeAppUrl}" style="color:#7c3aed;">storycot.com</a>.
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
    subject: `Your Storycot book is ready — ${storyTitle}`,
    html,
    text,
  });
}

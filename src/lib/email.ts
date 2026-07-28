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

function getEmailAssetOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_EMAIL_ASSET_ORIGIN ?? "https://storycot.com.au"
  );
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
  const logoUrl = joinUrl(
    getOriginUrl(getEmailAssetOrigin()),
    "/nav-icon-light.png"
  );
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
                <a href="${safeAppUrl}" style="color:#7c3aed;">storycot.com.au</a>.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `Hi ${toName}, your illustrated storybook "${storyTitle}" is ready!\n\nView it here: ${bookUrl}\n\n- The Storycot Team`;

  await client.emails.send({
    from: "Storycot <noreply@storycot.com.au>",
    to: toEmail,
    subject: `Your Storycot book is ready - ${storyTitle}`,
    html,
    text,
  });
}

export async function sendPublicStoryNotificationEmail(input: {
  toEmail: string;
  toName: string;
  storyTitle: string;
  subject: string;
  headline: string;
  body: string;
  actionUrl: string;
  actionLabel: string;
  appUrl: string;
}): Promise<void> {
  const client = getClient();
  if (!client) return;

  const {
    toEmail,
    toName,
    storyTitle,
    subject,
    headline,
    body,
    actionUrl,
    actionLabel,
    appUrl,
  } = input;
  const logoUrl = joinUrl(
    getOriginUrl(getEmailAssetOrigin()),
    "/nav-icon-light.png"
  );
  const safeName = escapeHtml(toName);
  const safeTitle = escapeHtml(storyTitle);
  const safeHeadline = escapeHtml(headline);
  const safeBody = escapeHtml(body);
  const safeActionUrl = escapeHtml(actionUrl);
  const safeActionLabel = escapeHtml(actionLabel);
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
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <table cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td style="padding-right:10px;">
                    <img src="${safeLogoUrl}" width="36" height="36" alt="" style="display:block;border-radius:10px;" />
                  </td>
                  <td style="font-size:30px;font-weight:800;color:#2d2058;letter-spacing:-0.4px;">Storycot</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;border:1px solid #ede9fe;border-radius:18px;padding:40px 36px;box-shadow:0 14px 34px rgba(45,32,88,0.08);">
              <p style="margin:0 0 8px;font-size:13px;font-weight:800;letter-spacing:0.08em;color:#7c3aed;text-transform:uppercase;">Public gallery</p>
              <h1 style="margin:0 0 16px;font-size:30px;font-weight:800;color:#1e1344;line-height:1.18;">${safeHeadline}</h1>
              <p style="margin:0 0 8px;font-size:15px;font-weight:800;color:#1e1344;">${safeTitle}</p>
              <p style="margin:0 0 28px;font-size:16px;color:#5b4e8a;line-height:1.65;">Hi ${safeName}, ${safeBody}</p>
              <table cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center">
                    <a href="${safeActionUrl}" style="display:inline-block;background:#2d2058;color:#fef9c3;text-decoration:none;font-size:15px;font-weight:800;padding:15px 36px;border-radius:100px;">${safeActionLabel}</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-top:24px;">
              <p style="margin:0;font-size:12px;color:#7c6dc8;">
                You're receiving this because you created a Storycot story.
                <a href="${safeAppUrl}" style="color:#7c3aed;">storycot.com.au</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `Hi ${toName}, ${body}\n\n${storyTitle}\n\n${actionLabel}: ${actionUrl}\n\n- The Storycot Team`;

  await client.emails.send({
    from: "Storycot <noreply@storycot.com.au>",
    to: toEmail,
    subject,
    html,
    text,
  });
}

export async function sendPrintOrderConfirmedEmail(input: {
  toEmail: string;
  toName: string;
  storyTitle: string;
  productLabel: string;
  amountAud: number;
  trackUrl: string;
  appUrl: string;
}): Promise<void> {
  const client = getClient();
  if (!client) return;

  const {
    toEmail,
    toName,
    storyTitle,
    productLabel,
    amountAud,
    trackUrl,
    appUrl,
  } = input;
  const logoUrl = joinUrl(
    getOriginUrl(getEmailAssetOrigin()),
    "/nav-icon-light.png"
  );
  const safeName = escapeHtml(toName);
  const safeTitle = escapeHtml(storyTitle);
  const safeProduct = escapeHtml(productLabel);
  const safeTrackUrl = escapeHtml(trackUrl);
  const safeAppUrl = escapeHtml(appUrl);
  const safeLogoUrl = escapeHtml(logoUrl);
  const safeAmount = amountAud.toLocaleString("en-AU", {
    style: "currency",
    currency: "AUD",
  });

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

              <p style="margin:0 0 8px;font-size:13px;font-weight:800;letter-spacing:0.08em;color:#7c3aed;text-transform:uppercase;">Order confirmed</p>
              <h1 style="margin:0 0 16px;font-size:30px;font-weight:800;color:#1e1344;line-height:1.18;">${safeTitle}</h1>

              <p style="margin:0 0 24px;font-size:16px;color:#5b4e8a;line-height:1.65;">
                Hi ${safeName}, your <strong>${safeProduct}</strong> of <em>${safeTitle}</em> has been confirmed (${safeAmount}). We&rsquo;ll get it printed and on its way to you.
              </p>

              <!-- Timeline -->
              <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:28px;">
                <tr>
                  <td style="background:#fdf6ee;border-radius:14px;padding:18px 20px;">
                    <p style="margin:0 0 4px;font-size:13px;font-weight:800;color:#1e1344;">What happens next</p>
                    <p style="margin:0;font-size:14px;color:#5b4e8a;line-height:1.7;">
                      Your book will be printed and shipped to you. We&rsquo;ll email you when it&rsquo;s on its way.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- CTA -->
              <table cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center">
                    <a href="${safeTrackUrl}"
                       style="display:inline-block;background:#2d2058;color:#fef9c3;text-decoration:none;font-size:15px;font-weight:800;padding:15px 36px;border-radius:100px;">
                      Track my order
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:20px 0 0;font-size:13px;color:#7c6dc8;text-align:center;line-height:1.5;">
                Your order status is updated here as it moves through production.<br />No need to wait for emails - just check back anytime.
              </p>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top:24px;">
              <p style="margin:0;font-size:12px;color:#7c6dc8;">
                You're receiving this because you placed an order on
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

  const text = `Hi ${toName}, your ${productLabel} of "${storyTitle}" is confirmed (${safeAmount}).\n\nYour book will be printed and shipped to you. We'll email you when it's on its way.\n\nTrack your order anytime at: ${trackUrl}\n\n- The Storycot Team`;

  await client.emails.send({
    from: "Storycot <noreply@storycot.com>",
    to: toEmail,
    subject: `Order confirmed - ${storyTitle} hardcover`,
    html,
    text,
  });
}

export async function sendGiftCreditsEmail(input: {
  toEmail: string;
  toName?: string;
  fromName?: string;
  credits: number;
  message?: string;
  redeemUrl: string;
  appUrl: string;
}) {
  const client = getClient();
  if (!client) return;

  const safeName = input.toName?.trim() || "there";
  const fromName = input.fromName?.trim() || "Someone";
  const giftLabel =
    input.credits === 1
      ? "1 Storycot credit"
      : `${input.credits} Storycot credits`;
  const safeRedeemUrl = escapeHtml(input.redeemUrl);
  const messageHtml = input.message
    ? `<p style="margin: 18px 0 0; padding: 14px 16px; border-radius: 16px; background: #fff7d6; color: #43345f; font-size: 15px; line-height: 1.5;">${escapeHtml(input.message)}</p>`
    : "";
  const html = `
  <div style="margin:0; padding:0; background:#f8f4e8;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8f4e8; padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px; background:#ffffff; border-radius:28px; overflow:hidden; font-family:Arial,sans-serif; color:#17122f;">
            <tr>
              <td style="background:#17122f; padding:28px 30px; color:#f8dc7a;">
                <div style="font-size:24px; font-weight:800;">Storycot</div>
                <div style="margin-top:8px; color:#d9d4f1; font-size:15px;">A bedtime story gift is waiting</div>
              </td>
            </tr>
            <tr>
              <td style="padding:30px;">
                <h1 style="margin:0; font-size:28px; line-height:1.15; color:#17122f;">${escapeHtml(fromName)} sent you ${escapeHtml(giftLabel)}</h1>
                <p style="margin:16px 0 0; color:#4b4265; font-size:16px; line-height:1.55;">Hi ${escapeHtml(safeName)}, redeem your gift to create personalised bedtime stories for the little one in your life.</p>
                ${messageHtml}
                <p style="margin:26px 0;">
                  <a href="${safeRedeemUrl}" style="display:inline-block; background:#f8dc7a; color:#17122f; text-decoration:none; font-weight:800; padding:14px 22px; border-radius:999px;">Redeem your gift</a>
                </p>
                <p style="margin:0; color:#817994; font-size:13px; line-height:1.5;">If the button does not work, open this link:<br>${safeRedeemUrl}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </div>`;

  const text = `Hi ${safeName}, ${fromName} sent you ${giftLabel} for Storycot.\n\nRedeem your gift: ${input.redeemUrl}\n\n${input.message ? `${input.message}\n\n` : ""}The Storycot Team`;

  await client.emails.send({
    from: "Storycot <hello@storycot.com>",
    to: input.toEmail,
    subject: `${fromName} sent you a Storycot gift`,
    html,
    text,
  });
}

export async function sendShippedEmail(input: {
  toEmail: string;
  toName: string;
  storyTitle: string;
  productLabel: string;
  trackingUrl?: string;
  carrier?: string;
  trackUrl: string;
  appUrl: string;
}): Promise<void> {
  const client = getClient();
  if (!client) return;

  const {
    toEmail,
    toName,
    storyTitle,
    productLabel,
    trackingUrl,
    carrier,
    trackUrl,
    appUrl,
  } = input;
  const logoUrl = joinUrl(
    getOriginUrl(getEmailAssetOrigin()),
    "/nav-icon-light.png"
  );
  const safeName = escapeHtml(toName);
  const safeTitle = escapeHtml(storyTitle);
  const safeProduct = escapeHtml(productLabel);
  const safeTrackUrl = escapeHtml(trackUrl);
  const safeAppUrl = escapeHtml(appUrl);
  const safeLogoUrl = escapeHtml(logoUrl);
  const safeCarrier = carrier ? escapeHtml(carrier) : null;
  const safeTrackingUrl = trackingUrl ? escapeHtml(trackingUrl) : null;

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

              <p style="margin:0 0 8px;font-size:13px;font-weight:800;letter-spacing:0.08em;color:#7c3aed;text-transform:uppercase;">Your book is on its way!</p>
              <h1 style="margin:0 0 16px;font-size:30px;font-weight:800;color:#1e1344;line-height:1.18;">${safeTitle}</h1>

              <p style="margin:0 0 24px;font-size:16px;color:#5b4e8a;line-height:1.65;">
                Hi ${safeName}, your <strong>${safeProduct}</strong> has left the printer and is heading your way.
              </p>

              ${
                safeTrackingUrl
                  ? `
              <!-- Tracking -->
              <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:28px;">
                <tr>
                  <td style="background:#fdf6ee;border-radius:14px;padding:18px 20px;">
                    <p style="margin:0 0 4px;font-size:13px;font-weight:800;color:#1e1344;">Tracking${safeCarrier ? ` · ${safeCarrier}` : ""}</p>
                    <a href="${safeTrackingUrl}" style="font-size:14px;color:#7c3aed;">${safeTrackingUrl}</a>
                  </td>
                </tr>
              </table>
              `
                  : ""
              }

              <!-- CTA -->
              <table cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center">
                    <a href="${safeTrackUrl}"
                       style="display:inline-block;background:#2d2058;color:#fef9c3;text-decoration:none;font-size:15px;font-weight:800;padding:15px 36px;border-radius:100px;">
                      View your order status
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:20px 0 0;font-size:13px;color:#7c6dc8;text-align:center;line-height:1.5;">
                Your full order history and status live here - check back anytime.
              </p>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top:24px;">
              <p style="margin:0;font-size:12px;color:#7c6dc8;">
                You're receiving this because you placed an order on
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

  const trackingLine = trackingUrl ? `\nTrack your parcel: ${trackingUrl}` : "";
  const text = `Hi ${toName}, your ${productLabel} of "${storyTitle}" is on its way!${trackingLine}\n\nView your order status: ${trackUrl}\n\n- The Storycot Team`;

  await client.emails.send({
    from: "Storycot <noreply@storycot.com>",
    to: toEmail,
    subject: `Your Storycot book is on its way - ${storyTitle}`,
    html,
    text,
  });
}

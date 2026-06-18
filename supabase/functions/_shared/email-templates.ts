// supabase/functions/_shared/email-templates.ts
// =============================================================================
// Centralized branded email template engine (Layer 2).
// One renderer + a registry of templates. Every transactional email in the app
// is produced here so there is a single source of branding, copy, and a11y.
//
// Design: keyed to DESIGN.md / frontend/lib/theme/tokens.ts (ElevenLabs editorial
// system) — off-white canvas, warm near-black ink pill, EB Garamond display
// (web-safe serif fallback), Inter body (system-sans fallback). HTML email
// constraints: table layout, inline CSS, mobile-responsive, prefers-color-scheme
// dark support, semantic alt text, >=44px touch targets, plaintext alternative.
//
// Multi-tenant / white-label: brand fields (product name, from-name, accent,
// support email, logo text) are passed per-call, so a second brand needs no
// code change — only a different `brand` object.
// =============================================================================

export interface EmailBrand {
  productName: string; // "PoultryOS"
  fromName: string; // sender display name
  supportEmail: string; // reply-to / footer support address
  baseUrl: string; // app origin for links/footer
  accentInk: string; // primary button / heading ink
}

export const DEFAULT_BRAND: EmailBrand = {
  productName: "PoultryOS",
  fromName: "PoultryOS",
  supportEmail: "support@infynarc.com",
  baseUrl: "https://poultryosadmin.infynarc.com",
  accentInk: "#292524",
};

// Token palette (mirrors tokens.ts — keep in sync; values, not names, matter here)
const C = {
  ink: "#0c0a09",
  heading: "#292524",
  body: "#4e4e4e",
  bodySoft: "#777169",
  muted: "#a8a29e",
  hairline: "#e7e5e4",
  canvas: "#ffffff",
  canvasSoft: "#f5f5f5",
  surfaceStrong: "#f0efed",
  onPrimary: "#ffffff",
  success: "#16a34a",
  successInk: "#15803d",
  successSoft: "#eafaf1",
  danger: "#dc2626",
  dangerSoft: "#fdecec",
  warning: "#92400E",
  warningSoft: "#fdf3e7",
};

const FONT_BODY =
  "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const FONT_DISPLAY =
  "'EB Garamond', Georgia, 'Times New Roman', serif";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

interface Block {
  // structured content the base layout renders
  preheader: string;
  heading: string;
  intro?: string;
  paragraphs?: string[];
  cta?: { label: string; url: string };
  tone?: "neutral" | "success" | "danger" | "warning"; // accent for callout/CTA
  callout?: { label: string; value: string }[]; // key/value rows (e.g. invoice)
  footnote?: string;
  securityNote?: boolean; // append "didn't request this?" guidance
}

// ---------------------------------------------------------------------------
// HTML escaping — all interpolated user/tenant data passes through this.
// ---------------------------------------------------------------------------
export function esc(input: unknown): string {
  return String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toneColor(tone: Block["tone"]) {
  switch (tone) {
    case "success":
      return { fill: C.successInk, soft: C.successSoft, ink: C.successInk };
    case "danger":
      return { fill: C.danger, soft: C.dangerSoft, ink: C.danger };
    case "warning":
      return { fill: C.warning, soft: C.warningSoft, ink: C.warning };
    default:
      return { fill: C.heading, soft: C.surfaceStrong, ink: C.heading };
  }
}

// ---------------------------------------------------------------------------
// Base layout — wraps a Block into a full responsive HTML email + plaintext.
// ---------------------------------------------------------------------------
function layout(block: Block, brand: EmailBrand): { html: string; text: string } {
  const t = toneColor(block.tone);
  const year = new Date().getFullYear();

  const paragraphs = (block.paragraphs ?? [])
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-family:${FONT_BODY};font-size:15px;line-height:1.6;color:${C.body};">${p}</p>`,
    )
    .join("");

  const calloutRows = (block.callout ?? [])
    .map(
      (row) => `
      <tr>
        <td style="padding:8px 0;font-family:${FONT_BODY};font-size:13px;color:${C.bodySoft};">${esc(row.label)}</td>
        <td align="right" style="padding:8px 0;font-family:${FONT_BODY};font-size:14px;font-weight:600;color:${C.heading};">${esc(row.value)}</td>
      </tr>`,
    )
    .join("");

  const calloutTable = block.callout?.length
    ? `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;background:${t.soft};border-radius:12px;">
        <tr><td style="padding:8px 20px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${calloutRows}</table>
        </td></tr>
      </table>`
    : "";

  const ctaButton = block.cta
    ? `
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;">
        <tr><td align="center" bgcolor="${t.fill}" style="border-radius:9999px;">
          <a href="${esc(block.cta.url)}" target="_blank"
             style="display:inline-block;padding:13px 28px;min-height:44px;box-sizing:border-box;font-family:${FONT_BODY};font-size:15px;font-weight:600;line-height:18px;color:${C.onPrimary};text-decoration:none;border-radius:9999px;">
            ${esc(block.cta.label)}
          </a>
        </td></tr>
      </table>
      <p style="margin:0 0 16px;font-family:${FONT_BODY};font-size:12px;line-height:1.5;color:${C.muted};word-break:break-all;">
        Or paste this link into your browser:<br><a href="${esc(block.cta.url)}" style="color:${t.ink};">${esc(block.cta.url)}</a>
      </p>`
    : "";

  const securityNote = block.securityNote
    ? `<p style="margin:24px 0 0;padding-top:16px;border-top:1px solid ${C.hairline};font-family:${FONT_BODY};font-size:12px;line-height:1.5;color:${C.muted};">
         Didn't request this? You can safely ignore this email — no changes were made to your account. If you're concerned, contact us at <a href="mailto:${esc(brand.supportEmail)}" style="color:${C.bodySoft};">${esc(brand.supportEmail)}</a>.
       </p>`
    : "";

  const footnote = block.footnote
    ? `<p style="margin:16px 0 0;font-family:${FONT_BODY};font-size:12px;line-height:1.5;color:${C.muted};">${block.footnote}</p>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>${esc(block.heading)}</title>
  <style>
    @media (prefers-color-scheme: dark) {
      .email-body { background:#0c0a09 !important; }
      .email-card { background:#1c1917 !important; border-color:#292524 !important; }
      .t-heading { color:#f5f5f4 !important; }
      .t-body { color:#d6d3d1 !important; }
      .t-muted { color:#a8a29e !important; }
    }
    @media only screen and (max-width:600px) {
      .email-card { width:100% !important; border-radius:0 !important; }
      .email-pad { padding:24px !important; }
    }
  </style>
</head>
<body class="email-body" style="margin:0;padding:0;background:${C.canvasSoft};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(block.preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.canvasSoft};">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" class="email-card" width="560" cellpadding="0" cellspacing="0"
             style="width:560px;max-width:560px;background:${C.canvas};border:1px solid ${C.hairline};border-radius:16px;overflow:hidden;">
        <tr><td class="email-pad" style="padding:40px;">
          <p style="margin:0 0 28px;font-family:${FONT_DISPLAY};font-size:22px;font-weight:400;letter-spacing:-0.3px;color:${C.heading};">
            ${esc(brand.productName)}
          </p>
          <h1 class="t-heading" style="margin:0 0 16px;font-family:${FONT_DISPLAY};font-size:26px;font-weight:400;line-height:1.25;letter-spacing:-0.5px;color:${C.heading};">
            ${esc(block.heading)}
          </h1>
          ${block.intro ? `<p class="t-body" style="margin:0 0 16px;font-family:${FONT_BODY};font-size:15px;line-height:1.6;color:${C.body};">${block.intro}</p>` : ""}
          ${paragraphs}
          ${ctaButton}
          ${calloutTable}
          ${footnote}
          ${securityNote}
        </td></tr>
      </table>
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:560px;">
        <tr><td style="padding:24px 40px;text-align:center;">
          <p class="t-muted" style="margin:0 0 4px;font-family:${FONT_BODY};font-size:12px;line-height:1.5;color:${C.muted};">
            ${esc(brand.productName)} — farm management for Indian poultry farmers.
          </p>
          <p class="t-muted" style="margin:0;font-family:${FONT_BODY};font-size:12px;line-height:1.5;color:${C.muted};">
            Need help? <a href="mailto:${esc(brand.supportEmail)}" style="color:${C.bodySoft};">${esc(brand.supportEmail)}</a> &middot; &copy; ${year} ${esc(brand.productName)}
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  // ---- plaintext alternative (deliverability + accessibility) ----
  const textLines: string[] = [brand.productName.toUpperCase(), "", block.heading, ""];
  if (block.intro) textLines.push(stripTags(block.intro), "");
  for (const p of block.paragraphs ?? []) textLines.push(stripTags(p), "");
  if (block.cta) textLines.push(`${block.cta.label}: ${block.cta.url}`, "");
  for (const row of block.callout ?? []) textLines.push(`${row.label}: ${row.value}`);
  if (block.callout?.length) textLines.push("");
  if (block.footnote) textLines.push(stripTags(block.footnote), "");
  if (block.securityNote)
    textLines.push("Didn't request this? You can safely ignore this email.", "");
  textLines.push(`Need help? ${brand.supportEmail}`);
  const text = textLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();

  return { html, text };
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#39;/g, "'");
}

// ---------------------------------------------------------------------------
// Template registry — email_type → (data, brand) => RenderedEmail
// All dynamic data is escaped at the point of interpolation.
// ---------------------------------------------------------------------------
type TemplateFn = (data: Record<string, unknown>, brand: EmailBrand) => {
  subject: string;
  block: Block;
};

const TEMPLATES: Record<string, TemplateFn> = {
  // --- Authentication ---
  welcome: (d, b) => ({
    subject: `Welcome to ${b.productName}`,
    block: {
      preheader: `Your ${b.productName} account is ready.`,
      heading: `Welcome aboard${d.name ? `, ${esc(d.name)}` : ""}`,
      intro: `Your ${esc(b.productName)} account is verified and ready. Let's get your farm set up.`,
      paragraphs: [
        "Add your first shed and batch, and you'll start seeing your daily mortality, feed, and FCR trends within minutes.",
      ],
      cta: { label: "Open dashboard", url: String(d.dashboardUrl ?? `${b.baseUrl}/onboarding`) },
      tone: "neutral",
      footnote: "Tip: turn on WhatsApp alerts in Settings so you never miss a mortality spike or payment reminder.",
    },
  }),

  password_changed: (d, b) => ({
    subject: `Your ${b.productName} password was changed`,
    block: {
      preheader: "Security notification for your account.",
      heading: "Your password was changed",
      intro: `The password for your ${esc(b.productName)} account (${esc(d.email)}) was just changed.`,
      paragraphs: [
        d.when ? `When: <strong>${esc(d.when)}</strong>` : "",
      ].filter(Boolean) as string[],
      tone: "warning",
      securityNote: true,
    },
  }),

  email_changed: (d, b) => ({
    subject: `Your ${b.productName} sign-in email was changed`,
    block: {
      preheader: "Security notification for your account.",
      heading: "Your sign-in email was changed",
      intro: `The email address on your ${esc(b.productName)} account was changed${d.newEmail ? ` to <strong>${esc(d.newEmail)}</strong>` : ""}.`,
      tone: "warning",
      securityNote: true,
    },
  }),

  login_alert: (d, b) => ({
    subject: `New sign-in to your ${b.productName} account`,
    block: {
      preheader: "We noticed a new sign-in.",
      heading: "New sign-in detected",
      intro: `A new sign-in to your ${esc(b.productName)} account was detected.`,
      callout: [
        d.when ? { label: "When", value: String(d.when) } : null,
        d.location ? { label: "Location", value: String(d.location) } : null,
        d.device ? { label: "Device", value: String(d.device) } : null,
      ].filter(Boolean) as { label: string; value: string }[],
      tone: "neutral",
      securityNote: true,
    },
  }),

  // --- SaaS / Billing ---
  tenant_invitation: (d, b) => ({
    subject: `${esc(d.inviterName ?? "Someone")} invited you to ${esc(d.farmName ?? b.productName)}`,
    block: {
      preheader: `Join ${esc(d.farmName ?? "the farm")} on ${b.productName}.`,
      heading: `You've been invited`,
      intro: `${esc(d.inviterName ?? "A farm owner")} has invited you to join <strong>${esc(d.farmName ?? "their farm")}</strong> on ${esc(b.productName)} as a ${esc(d.role ?? "team member")}.`,
      cta: { label: "Accept invitation", url: String(d.inviteUrl ?? `${b.baseUrl}/login`) },
      tone: "neutral",
      footnote: "If you don't have the app yet, you'll be guided to install it and sign up first.",
    },
  }),

  trial_started: (d, b) => ({
    subject: `Your ${b.productName} trial has started`,
    block: {
      preheader: "Everything unlocked for your trial period.",
      heading: "Your trial is live",
      intro: `Your ${esc(b.productName)} ${esc(d.planName ?? "Pro")} trial is now active${d.endsOn ? ` until <strong>${esc(d.endsOn)}</strong>` : ""}.`,
      paragraphs: ["Multi-farm dashboard, WhatsApp alerts, traceability, and contract tools are all unlocked. Make the most of it."],
      cta: { label: "Explore your plan", url: String(d.dashboardUrl ?? `${b.baseUrl}/multi-farm`) },
      tone: "success",
    },
  }),

  trial_expiring: (d, b) => ({
    subject: `Your ${b.productName} trial ends ${esc(d.endsIn ?? "soon")}`,
    block: {
      preheader: "Keep your premium features running.",
      heading: `Your trial ends ${esc(d.endsIn ?? "soon")}`,
      intro: `Your ${esc(b.productName)} ${esc(d.planName ?? "Pro")} trial ends ${esc(d.endsIn ?? "soon")}. Upgrade now to keep multi-farm, WhatsApp alerts, and traceability without interruption.`,
      cta: { label: "Upgrade now", url: String(d.billingUrl ?? `${b.baseUrl}/billing`) },
      tone: "warning",
      footnote: "Your data is always safe — only premium features pause if the trial lapses.",
    },
  }),

  subscription_activated: (d, b) => ({
    subject: `Your ${b.productName} subscription is active`,
    block: {
      preheader: "Thank you for subscribing.",
      heading: "Subscription activated",
      intro: `Your ${esc(b.productName)} ${esc(d.planName ?? "")} subscription is now active. Thank you for your support.`,
      callout: [
        d.planName ? { label: "Plan", value: String(d.planName) } : null,
        d.amount ? { label: "Amount", value: String(d.amount) } : null,
        d.renewsOn ? { label: "Renews on", value: String(d.renewsOn) } : null,
      ].filter(Boolean) as { label: string; value: string }[],
      cta: { label: "View dashboard", url: String(d.dashboardUrl ?? `${b.baseUrl}/multi-farm`) },
      tone: "success",
    },
  }),

  subscription_expired: (d, b) => ({
    subject: `Your ${b.productName} subscription has expired`,
    block: {
      preheader: "Renew to restore premium features.",
      heading: "Your subscription has expired",
      intro: `Your ${esc(b.productName)} ${esc(d.planName ?? "")} subscription has expired. Renew now to restore editing and premium features — your data is safe.`,
      cta: { label: "Renew subscription", url: String(d.billingUrl ?? `${b.baseUrl}/billing`) },
      tone: "danger",
    },
  }),

  payment_success: (d, b) => ({
    subject: `Payment received — ${b.productName}`,
    block: {
      preheader: "Your payment was successful.",
      heading: "Payment received",
      intro: `We've received your payment. Thank you.`,
      callout: [
        d.amount ? { label: "Amount", value: String(d.amount) } : null,
        d.planName ? { label: "Plan", value: String(d.planName) } : null,
        d.invoiceId ? { label: "Invoice", value: String(d.invoiceId) } : null,
        d.paidOn ? { label: "Date", value: String(d.paidOn) } : null,
      ].filter(Boolean) as { label: string; value: string }[],
      cta: d.invoiceUrl ? { label: "View invoice", url: String(d.invoiceUrl) } : undefined,
      tone: "success",
    },
  }),

  payment_failed: (d, b) => ({
    subject: `Payment failed — action needed`,
    block: {
      preheader: "We couldn't process your payment.",
      heading: "Your payment failed",
      intro: `We couldn't process your latest ${esc(b.productName)} payment${d.amount ? ` of <strong>${esc(d.amount)}</strong>` : ""}. Please update your payment method to avoid losing premium features.`,
      cta: { label: "Update payment", url: String(d.billingUrl ?? `${b.baseUrl}/billing`) },
      tone: "danger",
      footnote: "We'll retry automatically, but updating now is the fastest way to stay active.",
    },
  }),

  // --- Generic security / system ---
  security_alert: (d, b) => ({
    subject: String(d.subject ?? `Security alert — ${b.productName}`),
    block: {
      preheader: String(d.preheader ?? "Security notification for your account."),
      heading: String(d.heading ?? "Security alert"),
      intro: esc(d.message ?? "We detected activity that needs your attention."),
      tone: "danger",
      securityNote: true,
    },
  }),

  system_notification: (d, b) => ({
    subject: String(d.subject ?? `${b.productName} notification`),
    block: {
      preheader: String(d.preheader ?? ""),
      heading: String(d.heading ?? "Notification"),
      intro: esc(d.message ?? ""),
      cta: d.ctaUrl ? { label: String(d.ctaLabel ?? "Open"), url: String(d.ctaUrl) } : undefined,
      tone: "neutral",
    },
  }),
};

export const SUPPORTED_TEMPLATE_IDS = Object.keys(TEMPLATES);

/**
 * Render a transactional email. Throws if template_id is unknown so callers
 * fail loudly in development; the Edge Function maps that to a logged failure.
 */
export function renderEmail(
  templateId: string,
  data: Record<string, unknown>,
  brand: EmailBrand = DEFAULT_BRAND,
): RenderedEmail {
  const fn = TEMPLATES[templateId];
  if (!fn) {
    throw new Error(
      `Unknown email template_id '${templateId}'. Supported: ${SUPPORTED_TEMPLATE_IDS.join(", ")}`,
    );
  }
  const { subject, block } = fn(data, brand);
  const { html, text } = layout(block, brand);
  return { subject, html, text };
}

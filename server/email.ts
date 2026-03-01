import { Resend } from "resend";
import { ENV } from "./_core/env";

// ─── Resend client (lazy-init so missing key doesn't crash on import) ──────
let _resend: Resend | null = null;
function getResend() {
  if (!_resend) _resend = new Resend(ENV.resendApiKey);
  return _resend;
}

// ─── Shared layout ────────────────────────────────────────────────────────
function layout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    body { margin:0; padding:0; background:#0f0f0f; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color:#e5e5e5; }
    .wrapper { max-width:600px; margin:0 auto; padding:32px 16px; }
    .card { background:#1a1a1a; border:1px solid #2a2a2a; border-radius:12px; padding:32px; }
    .logo { display:flex; align-items:center; gap:10px; margin-bottom:28px; }
    .logo-icon { width:36px; height:36px; background:#10b981; border-radius:8px; display:flex; align-items:center; justify-content:center; font-size:18px; }
    .logo-text { font-size:18px; font-weight:700; color:#fff; }
    h1 { font-size:22px; font-weight:700; color:#fff; margin:0 0 12px; }
    p { font-size:15px; line-height:1.6; color:#a3a3a3; margin:0 0 16px; }
    .btn { display:inline-block; padding:12px 28px; background:#10b981; color:#fff !important; text-decoration:none; border-radius:8px; font-weight:600; font-size:15px; margin:8px 0 20px; }
    .divider { border:none; border-top:1px solid #2a2a2a; margin:24px 0; }
    .detail-row { display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #222; font-size:14px; }
    .detail-label { color:#737373; }
    .detail-value { color:#e5e5e5; font-weight:500; text-align:right; max-width:60%; }
    .footer { text-align:center; margin-top:24px; font-size:12px; color:#525252; }
    .badge { display:inline-block; padding:2px 10px; border-radius:99px; font-size:12px; font-weight:600; }
    .badge-green { background:#052e16; color:#4ade80; border:1px solid #166534; }
    .badge-amber { background:#1c1400; color:#fbbf24; border:1px solid #92400e; }
    .badge-red { background:#1c0606; color:#f87171; border:1px solid #7f1d1d; }
    .badge-blue { background:#0c1a2e; color:#60a5fa; border:1px solid #1e3a5f; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="logo">
        <div class="logo-icon">🔧</div>
        <span class="logo-text">Maintenance Manager</span>
      </div>
      ${body}
    </div>
    <div class="footer">
      <p>You received this email because you have an account on Maintenance Manager.<br/>
      If you believe this was sent in error, you can safely ignore it.</p>
    </div>
  </div>
</body>
</html>`;
}

// ─── Core send helper ─────────────────────────────────────────────────────
async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<boolean> {
  if (!ENV.resendApiKey) {
    console.warn("[Email] RESEND_API_KEY not set — skipping email to", opts.to);
    return false;
  }
  try {
    const { error } = await getResend().emails.send({
      from: ENV.emailFrom,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    });
    if (error) {
      console.error("[Email] Send error:", error);
      return false;
    }
    console.log("[Email] Sent:", opts.subject, "→", opts.to);
    return true;
  } catch (err) {
    console.error("[Email] Exception:", err);
    return false;
  }
}

// ─── Welcome email ────────────────────────────────────────────────────────
export async function sendWelcomeEmail(opts: { to: string; name: string; role: string }) {
  const roleLabel = opts.role === "contractor" ? "Contractor" : "Company Admin";
  const html = layout("Welcome to Maintenance Manager", `
    <h1>Welcome, ${opts.name}! 👋</h1>
    <p>Your <strong>${roleLabel}</strong> account is ready. Here's what you can do next:</p>
    ${opts.role === "contractor" ? `
      <ul style="color:#a3a3a3;font-size:15px;line-height:2;">
        <li>Complete your contractor profile and set your service area</li>
        <li>Browse available jobs on the Job Board</li>
        <li>Accept jobs and start earning</li>
      </ul>
    ` : `
      <ul style="color:#a3a3a3;font-size:15px;line-height:2;">
        <li>Add your properties</li>
        <li>Post maintenance jobs</li>
        <li>Invite or find contractors</li>
      </ul>
    `}
    <a href="${process.env.VITE_OAUTH_PORTAL_URL ?? "#"}" class="btn">Go to Dashboard</a>
  `);
  return sendEmail({ to: opts.to, subject: "Welcome to Maintenance Manager", html });
}

// ─── Password reset email ─────────────────────────────────────────────────
export async function sendPasswordResetEmail(opts: { to: string; name: string; resetUrl: string }) {
  const html = layout("Reset your password", `
    <h1>Reset your password</h1>
    <p>Hi ${opts.name}, we received a request to reset your Maintenance Manager password.</p>
    <a href="${opts.resetUrl}" class="btn">Reset Password</a>
    <p style="font-size:13px;color:#525252;">This link expires in <strong>1 hour</strong>. If you didn't request a reset, you can safely ignore this email.</p>
    <hr class="divider" />
    <p style="font-size:12px;color:#525252;">Or copy this link: ${opts.resetUrl}</p>
  `);
  return sendEmail({ to: opts.to, subject: "Reset your Maintenance Manager password", html });
}

// ─── Job assigned to contractor ───────────────────────────────────────────
export async function sendJobAssignedEmail(opts: {
  to: string;
  contractorName: string;
  jobTitle: string;
  jobId: number;
  propertyName: string;
  companyName: string;
  appUrl: string;
}) {
  const html = layout("New Job Assigned", `
    <h1>You've been assigned a job</h1>
    <p>Hi ${opts.contractorName}, <strong>${opts.companyName}</strong> has assigned you a new maintenance job.</p>
    <div style="margin:20px 0;">
      <div class="detail-row"><span class="detail-label">Job</span><span class="detail-value">${opts.jobTitle}</span></div>
      <div class="detail-row"><span class="detail-label">Property</span><span class="detail-value">${opts.propertyName}</span></div>
      <div class="detail-row"><span class="detail-label">Company</span><span class="detail-value">${opts.companyName}</span></div>
    </div>
    <a href="${opts.appUrl}/contractor/my-jobs" class="btn">View Job</a>
  `);
  return sendEmail({ to: opts.to, subject: `New Job: ${opts.jobTitle}`, html });
}

// ─── Job submitted for verification ──────────────────────────────────────
export async function sendJobSubmittedEmail(opts: {
  to: string;
  companyAdminName: string;
  jobTitle: string;
  contractorName: string;
  propertyName: string;
  appUrl: string;
}) {
  const html = layout("Job Ready for Verification", `
    <h1>A job is ready for your review</h1>
    <p>Hi ${opts.companyAdminName}, <strong>${opts.contractorName}</strong> has marked a job as complete and submitted it for your verification.</p>
    <div style="margin:20px 0;">
      <div class="detail-row"><span class="detail-label">Job</span><span class="detail-value">${opts.jobTitle}</span></div>
      <div class="detail-row"><span class="detail-label">Property</span><span class="detail-value">${opts.propertyName}</span></div>
      <div class="detail-row"><span class="detail-label">Contractor</span><span class="detail-value">${opts.contractorName}</span></div>
    </div>
    <a href="${opts.appUrl}/company/verification" class="btn">Review &amp; Verify</a>
  `);
  return sendEmail({ to: opts.to, subject: `Job Submitted for Review: ${opts.jobTitle}`, html });
}

// ─── Job verified and paid ────────────────────────────────────────────────
export async function sendJobPaidEmail(opts: {
  to: string;
  contractorName: string;
  jobTitle: string;
  payoutAmount: string;
  appUrl: string;
}) {
  const html = layout("Payment Confirmed", `
    <h1>Your payment is on the way 💰</h1>
    <p>Hi ${opts.contractorName}, your job has been verified and payment has been processed.</p>
    <div style="margin:20px 0;">
      <div class="detail-row"><span class="detail-label">Job</span><span class="detail-value">${opts.jobTitle}</span></div>
      <div class="detail-row"><span class="detail-label">Payout</span><span class="detail-value" style="color:#4ade80;font-weight:700;">${opts.payoutAmount}</span></div>
    </div>
    <a href="${opts.appUrl}/contractor/earnings" class="btn">View Earnings</a>
  `);
  return sendEmail({ to: opts.to, subject: `Payment Confirmed: ${opts.jobTitle}`, html });
}

// ─── New comment on a job ─────────────────────────────────────────────────
export async function sendNewCommentEmail(opts: {
  to: string;
  recipientName: string;
  authorName: string;
  jobTitle: string;
  commentPreview: string;
  jobId: number;
  appUrl: string;
  role: "company" | "contractor";
}) {
  const jobPath = opts.role === "company" ? "/company/jobs" : "/contractor/my-jobs";
  const html = layout("New Comment on Your Job", `
    <h1>New message on a job</h1>
    <p>Hi ${opts.recipientName}, <strong>${opts.authorName}</strong> left a comment on <strong>${opts.jobTitle}</strong>.</p>
    <div style="background:#111;border:1px solid #2a2a2a;border-radius:8px;padding:16px;margin:16px 0;">
      <p style="margin:0;font-style:italic;color:#d4d4d4;">"${opts.commentPreview}"</p>
    </div>
    <a href="${opts.appUrl}${jobPath}?openComments=${opts.jobId}" class="btn">View &amp; Reply</a>
  `);
  return sendEmail({ to: opts.to, subject: `New comment on: ${opts.jobTitle}`, html });
}

// ─── Job disputed ─────────────────────────────────────────────────────────
export async function sendJobDisputedEmail(opts: {
  to: string;
  contractorName: string;
  jobTitle: string;
  disputeReason: string;
  appUrl: string;
}) {
  const html = layout("Job Disputed", `
    <h1>A job has been disputed</h1>
    <p>Hi ${opts.contractorName}, the company has opened a dispute on <strong>${opts.jobTitle}</strong>.</p>
    <div style="background:#1c0606;border:1px solid #7f1d1d;border-radius:8px;padding:16px;margin:16px 0;">
      <p style="margin:0;color:#f87171;font-size:14px;"><strong>Reason:</strong> ${opts.disputeReason}</p>
    </div>
    <p>You can review the dispute and resubmit the job with a response note from your dashboard.</p>
    <a href="${opts.appUrl}/contractor/my-jobs" class="btn">View Disputed Job</a>
  `);
  return sendEmail({ to: opts.to, subject: `Job Disputed: ${opts.jobTitle}`, html });
}

// ─── Dispute resubmitted (notify company) ────────────────────────────────
export async function sendDisputeResubmittedEmail(opts: {
  to: string;
  companyAdminName: string;
  contractorName: string;
  jobTitle: string;
  responseNote: string;
  appUrl: string;
}) {
  const html = layout("Contractor Responded to Dispute", `
    <h1>Dispute response received</h1>
    <p>Hi ${opts.companyAdminName}, <strong>${opts.contractorName}</strong> has responded to the dispute on <strong>${opts.jobTitle}</strong> and resubmitted the job for verification.</p>
    <div style="background:#0c1a2e;border:1px solid #1e3a5f;border-radius:8px;padding:16px;margin:16px 0;">
      <p style="margin:0;color:#93c5fd;font-size:14px;"><strong>Contractor's response:</strong><br/>${opts.responseNote}</p>
    </div>
    <a href="${opts.appUrl}/company/verification" class="btn">Review Again</a>
  `);
  return sendEmail({ to: opts.to, subject: `Dispute Response: ${opts.jobTitle}`, html });
}
// ─── Trial expiry warning (3 days before) ─────────────────────────────────
export async function sendTrialExpiryWarningEmail(opts: {
  to: string;
  name: string;
  planName: string;
  daysRemaining: number;
  billingUrl: string;
}) {
  const html = layout("Your trial is ending soon", `
    <h1>Your trial ends in ${opts.daysRemaining} day${opts.daysRemaining !== 1 ? "s" : ""}</h1>
    <p>Hi ${opts.name}, your <strong>${opts.planName}</strong> trial on Maintenance Manager will expire in <strong>${opts.daysRemaining} day${opts.daysRemaining !== 1 ? "s" : ""}</strong>.</p>
    <p>To keep uninterrupted access to all your plan features — including GPS time tracking, AI job classification, expense reports, and more — subscribe before your trial ends.</p>
    <a href="${opts.billingUrl}" class="btn">Subscribe Now</a>
    <hr class="divider" />
    <p style="font-size:13px;color:#737373;">After your trial expires, feature access will be restricted until a subscription is active. Your data is always safe and will remain intact.</p>
  `);
  return sendEmail({ to: opts.to, subject: `Your ${opts.planName} trial ends in ${opts.daysRemaining} day${opts.daysRemaining !== 1 ? "s" : ""}`, html });
}

// ─── Trial expired ────────────────────────────────────────────────────────
export async function sendTrialExpiredEmail(opts: {
  to: string;
  name: string;
  planName: string;
  billingUrl: string;
}) {
  const html = layout("Your trial has expired", `
    <h1>Your trial has ended</h1>
    <p>Hi ${opts.name}, your <strong>${opts.planName}</strong> trial on Maintenance Manager has expired. Some features are now restricted.</p>
    <p>Subscribe to restore full access to GPS time tracking, AI classification, expense reports, ratings, and all other plan features.</p>
    <a href="${opts.billingUrl}" class="btn">Reactivate Now</a>
    <hr class="divider" />
    <p style="font-size:13px;color:#737373;">Your account data is safe. Subscribing will immediately restore all features.</p>
  `);
  return sendEmail({ to: opts.to, subject: `Your ${opts.planName} trial has expired — reactivate now`, html });
}

// ─── Contractor Invite ────────────────────────────────────────────────────
export async function sendContractorInviteEmail(opts: {
  to: string;
  name: string;
  companyName: string;
  inviteUrl: string;
  expiresInDays: number;
}) {
  const html = layout("You've been invited to join Maintenance Manager", `
    <h1>You're invited!</h1>
    <p>Hi ${opts.name || "there"},</p>
    <p><strong>${opts.companyName}</strong> has invited you to join their contractor network on <strong>Maintenance Manager</strong> — the AI-powered platform for property maintenance.</p>
    <p>As a connected contractor you'll be able to:</p>
    <ul style="margin:12px 0 16px 0;padding-left:20px;color:#a3a3a3;">
      <li>Receive and accept maintenance jobs from ${opts.companyName}</li>
      <li>Clock in/out with GPS time tracking</li>
      <li>Submit expense receipts and get paid automatically via Stripe</li>
      <li>Build your rating and grow your business</li>
    </ul>
    <a href="${opts.inviteUrl}" class="btn">Accept Invitation &amp; Sign Up</a>
    <hr class="divider" />
    <p style="font-size:13px;color:#737373;">This invitation expires in ${opts.expiresInDays} day${opts.expiresInDays !== 1 ? "s" : ""}. If you did not expect this email, you can safely ignore it.</p>
  `);
  return sendEmail({
    to: opts.to,
    subject: `${opts.companyName} invited you to join Maintenance Manager`,
    html,
  });
}

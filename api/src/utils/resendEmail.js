const { Resend } = require('resend');

let resendClient = null;

function getResend() {
  assertEmailConfig();
  if (!resendClient) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

function getFromAddress() {
  return process.env.EMAIL_FROM || 'noreply@reset.sporff.ca';
}

function getFrontendUrl() {
  const url = process.env.FRONTEND_URL?.split(',')[0]?.trim().replace(/\/$/, '');
  if (!url) {
    throw new Error('FRONTEND_URL is not configured on the server.');
  }
  return url;
}

function assertEmailConfig() {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not configured on the server.');
  }
}

function formatResendError(error) {
  if (!error) return 'Unknown email delivery error';
  const parts = [error.message, error.name].filter(Boolean);
  return parts.join(' (') + (parts.length > 1 ? ')' : '');
}

async function sendEmail({ to, subject, html }) {
  const from = getFromAddress();
  const resend = getResend();

  console.log('[Resend] Sending email from:', from, 'to:', to);

  const { data, error } = await resend.emails.send({
    from,
    to,
    subject,
    html
  });

  if (error) {
    console.error('[Resend] Email failed:', error);
    throw new Error(formatResendError(error));
  }

  console.log('[Resend] Email sent:', data?.id, 'to:', to);
  return data;
}

/**
 * Sends an email verification link to a newly registered Head Coach.
 */
const sendVerificationEmail = async (toEmail, token) => {
  const verifyUrl = `${getFrontendUrl()}/verify.html?token=${token}`;

  return sendEmail({
    to: toEmail,
    subject: 'Verify Your Head Coach Workspace Account',
    html: `
      <h2>Welcome to Coaching Hockey Made Easy!</h2>
      <p>Please click the button below to verify your email address before building your team workspace.</p>
      <a href="${verifyUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
        Verify Account
      </a>
      <p style="margin-top: 16px; font-size: 12px; color: #64748b;">Or copy this link: ${verifyUrl}</p>
    `
  });
};

/**
 * Sends a unique direct access link to a player when a video is assigned to them.
 */
const sendPlayerVideoLink = async (toEmail, playerName, videoTitle, note, accessToken) => {
  const videoUrl = `${getFrontendUrl()}/player-video.html?token=${accessToken}`;

  return sendEmail({
    to: toEmail,
    subject: `New Video Assignment: ${videoTitle}`,
    html: `
      <h2>Hi ${playerName},</h2>
      <p>Your coaching staff has assigned a new video for you to watch:</p>
      <blockquote style="border-left: 4px solid #2563eb; padding-left: 12px; color: #334155; font-style: italic;">
        "${note || 'Check out this video snippet.'}"
      </blockquote>
      <p style="margin-top: 20px;">
        <a href="${videoUrl}" style="background-color: #10b981; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
          Watch Assigned Video
        </a>
      </p>
    `
  });
};

/**
 * Sends a password reset link to a coach / head coach.
 */
const sendPasswordResetEmail = async (toEmail, token) => {
  const resetUrl = `${getFrontendUrl()}/reset-password.html?token=${token}`;

  return sendEmail({
    to: toEmail,
    subject: 'Reset Your Coaching Hockey Made Easy Password',
    html: `
      <h2>Password Reset</h2>
      <p>We received a request to reset the password for your coaching account. This link expires in 1 hour.</p>
      <a href="${resetUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
        Reset Password
      </a>
      <p style="margin-top: 16px; font-size: 12px; color: #64748b;">Or copy this link: ${resetUrl}</p>
      <p style="margin-top: 16px; font-size: 12px; color: #64748b;">If you did not request this, you can ignore this email.</p>
    `
  });
};

const COACH_INVITE_TTL_DAYS = 7;

function buildCoachInviteResetUrl(frontendUrl, token) {
  const base = String(frontendUrl || '').replace(/\/$/, '');
  return `${base}/reset-password.html?token=${encodeURIComponent(token)}&invite=1`;
}

function buildCoachInviteEmail({ name, resetUrl }) {
  const greeting = name ? `Hi ${name},` : 'Hi,';
  return {
    subject: 'Set Your Coaching Hockey Made Easy Password',
    html: `
      <h2>${greeting}</h2>
      <p>A head coach added you as an assistant coach. Create your own password to join the team workspace.</p>
      <p>This link expires in ${COACH_INVITE_TTL_DAYS} days.</p>
      <a href="${resetUrl}" style="background-color: #10b981; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
        Create Password
      </a>
      <p style="margin-top: 16px; font-size: 12px; color: #64748b;">Or copy this link: ${resetUrl}</p>
      <p style="margin-top: 16px; font-size: 12px; color: #64748b;">If you were not expecting this invite, you can ignore this email.</p>
    `
  };
}

/**
 * Sends an invite so an assistant coach can create their own password.
 */
const sendCoachInviteEmail = async (toEmail, token, name) => {
  const resetUrl = buildCoachInviteResetUrl(getFrontendUrl(), token);
  const { subject, html } = buildCoachInviteEmail({ name, resetUrl });
  return sendEmail({ to: toEmail, subject, html });
};

module.exports = {
  COACH_INVITE_TTL_DAYS,
  buildCoachInviteEmail,
  buildCoachInviteResetUrl,
  sendVerificationEmail,
  sendPlayerVideoLink,
  sendPasswordResetEmail,
  sendCoachInviteEmail
};

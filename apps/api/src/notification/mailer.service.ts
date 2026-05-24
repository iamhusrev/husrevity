import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { Notification } from './notification.entity';

/**
 * Thin nodemailer wrapper for the email notification channel.
 *
 * Transport: Gmail SMTP via an app password.
 *   MAIL_HOST       smtp.gmail.com      (default)
 *   MAIL_PORT       465                 (default; implicit TLS)
 *   MAIL_USER       <gmail address>
 *   MAIL_PASS       <16-char app password — NOT the account password>
 *   MAIL_FROM       "Husrevity <iamhusrev@gmail.com>"  (defaults to MAIL_USER)
 *   MAIL_REPLY_TO   optional reply-to address
 *
 * Generate an app password at: https://myaccount.google.com/apppasswords
 * (requires 2FA on the Gmail account).
 *
 * When unconfigured the service stays alive as a no-op so the rest of the
 * stack boots fine — dispatcher just skips the email leg.
 */
@Injectable()
export class MailerService implements OnModuleInit {
  private readonly logger = new Logger(MailerService.name);
  private transporter: nodemailer.Transporter | null = null;
  private fromAddress = '';
  private replyTo: string | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const user = this.config.get<string>('MAIL_USER');
    const pass = this.config.get<string>('MAIL_PASS');
    if (!user || !pass) {
      this.logger.warn(
        'MAIL_USER / MAIL_PASS not configured — email notifications disabled. ' +
          'Generate an app password at https://myaccount.google.com/apppasswords ' +
          'and set MAIL_USER + MAIL_PASS in apps/api/.env.',
      );
      return;
    }
    const host = this.config.get<string>('MAIL_HOST') ?? 'smtp.gmail.com';
    const port = Number(this.config.get<string>('MAIL_PORT') ?? '465');
    const secure = port === 465;
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });
    this.fromAddress = this.config.get<string>('MAIL_FROM') ?? user;
    this.replyTo = this.config.get<string>('MAIL_REPLY_TO') ?? null;
    this.logger.log(`Mailer initialised (host=${host}, port=${port})`);
  }

  isConfigured(): boolean {
    return this.transporter !== null;
  }

  /**
   * Send one notification email. Subject defaults to the notification title;
   * body is rendered as a small husrev-themed HTML template with a plain
   * text fallback.
   *
   * Best-effort: a failure here must not poison the dispatcher loop, so we
   * log and swallow. The notification row stays `dispatched` either way —
   * push already went out (or was attempted).
   */
  async sendNotificationEmail(
    to: string,
    n: Notification,
    webBaseUrl: string,
  ): Promise<void> {
    if (!this.transporter) return;
    const url = `${webBaseUrl.replace(/\/+$/, '')}${n.deepLink ?? '/dashboard'}`;
    const subject = `🔔 ${n.title}`;
    const text = renderText(n, url);
    const html = renderHtml(n, url);
    try {
      await this.transporter.sendMail({
        from: this.fromAddress,
        to,
        replyTo: this.replyTo ?? undefined,
        subject,
        text,
        html,
      });
    } catch (e) {
      this.logger.warn(
        `sendMail failed for notification ${n.id}: ${(e as Error).message}`,
      );
    }
  }

  /**
   * Admin invite. Returns `true` on success so the caller can flip the
   * `emailDelivered` flag in the response — admins need to know whether to
   * share the link manually as a fallback.
   */
  async sendInviteEmail(
    to: string,
    inviteUrl: string,
    invitedByEmail: string,
    firstName: string | null,
    expiresAt: Date,
  ): Promise<boolean> {
    if (!this.transporter) return false;
    const subject = `Husrevity'ye davet edildin`;
    const greeting = firstName ? `Merhaba ${escapeHtml(firstName)},` : 'Merhaba,';
    const expiresLine = expiresAt.toLocaleString('tr-TR', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
    const text = [
      firstName ? `Merhaba ${firstName},` : 'Merhaba,',
      '',
      `${invitedByEmail} seni Husrevity'ye davet etti.`,
      '',
      `Aşağıdaki linke tıklayıp şifreni belirleyebilirsin (son geçerlilik: ${expiresLine}):`,
      inviteUrl,
      '',
      '— Husrevity',
    ].join('\n');
    const html = `<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Husrevity Davet</title></head>
<body style="margin:0;padding:32px 16px;background:#f6f3ec;color:#1a1814;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" width="100%" style="max-width:560px;margin:0 auto;">
    <tr><td style="padding:0 0 16px 0;">
      <span style="display:inline-block;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#a14d18;">
        Husrevity · Davet
      </span>
    </td></tr>
    <tr><td style="background:#fff;border:1px solid #ebe5d6;border-radius:16px;box-shadow:0 1px 2px rgba(43,40,35,0.04),0 8px 24px rgba(43,40,35,0.06);padding:28px;">
      <p style="margin:0 0 8px 0;font-size:15px;line-height:1.55;color:#1a1814;">${greeting}</p>
      <p style="margin:0 0 16px 0;font-size:15px;line-height:1.55;color:#3a3530;">
        <strong>${escapeHtml(invitedByEmail)}</strong> seni Husrevity'ye davet etti.
      </p>
      <p style="margin:0 0 20px 0;font-size:14px;line-height:1.55;color:#3a3530;">
        Şifreni belirlemek ve hesabını oluşturmak için aşağıdaki düğmeye tıkla.
      </p>
      <a href="${escapeHtml(inviteUrl)}" style="display:inline-block;background:#a14d18;color:#f6f3ec;text-decoration:none;padding:11px 22px;border-radius:9999px;font-weight:500;font-size:14px;">
        Davete katıl
      </a>
      <p style="margin:18px 0 0 0;font-size:12px;color:#7a7268;">
        Bağlantı ${escapeHtml(expiresLine)} tarihine kadar geçerlidir. Eğer bu daveti beklemiyorsan görmezden gelebilirsin.
      </p>
    </td></tr>
    <tr><td style="padding:16px 4px 0 4px;font-size:12px;color:#7a7268;">Husrevity</td></tr>
  </table>
</body></html>`;
    try {
      await this.transporter.sendMail({
        from: this.fromAddress,
        to,
        replyTo: this.replyTo ?? invitedByEmail,
        subject,
        text,
        html,
      });
      return true;
    } catch (e) {
      this.logger.warn(`Invite mail failed for ${to}: ${(e as Error).message}`);
      return false;
    }
  }
}

function renderText(n: Notification, url: string): string {
  const parts = [n.title];
  if (n.body) parts.push('', n.body);
  parts.push('', `→ ${url}`, '', '— Husrevity');
  return parts.join('\n');
}

function renderHtml(n: Notification, url: string): string {
  const safeTitle = escapeHtml(n.title);
  const safeBody = n.body ? escapeHtml(n.body).replace(/\n/g, '<br>') : '';
  return `<!doctype html>
<html lang="tr">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${safeTitle}</title>
  </head>
  <body style="margin:0;padding:32px 16px;background:#f6f3ec;color:#1a1814;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" width="100%" style="max-width:560px;margin:0 auto;">
      <tr>
        <td style="padding:0 0 16px 0;">
          <span style="display:inline-block;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#a14d18;">
            Husrevity · Bildirim
          </span>
        </td>
      </tr>
      <tr>
        <td style="background:#ffffff;border:1px solid #ebe5d6;border-radius:16px;box-shadow:0 1px 2px rgba(43,40,35,0.04),0 8px 24px rgba(43,40,35,0.06);padding:28px 28px 24px 28px;">
          <h1 style="margin:0 0 8px 0;font-family:'Instrument Serif',Georgia,serif;font-weight:400;font-size:26px;line-height:1.2;color:#1a1814;">
            ${safeTitle}
          </h1>
          ${
            safeBody
              ? `<p style="margin:8px 0 20px 0;font-size:15px;line-height:1.55;color:#3a3530;">${safeBody}</p>`
              : '<div style="height:12px"></div>'
          }
          <a href="${escapeHtml(url)}" style="display:inline-block;background:#a14d18;color:#f6f3ec;text-decoration:none;padding:10px 18px;border-radius:9999px;font-weight:500;font-size:14px;">
            Aç
          </a>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 4px 0 4px;font-size:12px;color:#7a7268;">
          <a href="${escapeHtml(webBase(url))}/settings/profile" style="color:#a14d18;text-decoration:none;">E-posta tercihlerini düzenle</a>
          &nbsp;·&nbsp; Husrevity
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function webBase(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return url;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

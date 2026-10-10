import { Injectable, Logger } from '@nestjs/common';
import { Result, ok, err } from 'neverthrow';
import { IEmailSender } from '../domain/repositories/email-sender.interface';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';

const SMTP_TIMEOUT_MS = 10_000;

@Injectable()
export class SmtpEmailSender implements IEmailSender {
  private readonly logger = new Logger(SmtpEmailSender.name);
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(configService: ConfigService) {
    this.from = configService.getOrThrow<string>('MAIL_FROM');
    const host = configService.getOrThrow<string>('MAIL_HOST');

    const port = Number(configService.getOrThrow<string>('MAIL_PORT'));
    if (!Number.isInteger(port) || port <= 0) {
      throw new Error('MAIL_PORT must be a positive integer');
    }

    const secure = configService.get<string>('MAIL_SECURE') === 'true';

    const user = configService.get<string>('MAIL_USER');
    const pass = configService.get<string>('MAIL_PASSWORD');

    this.transporter = createTransport({
      host,
      port,
      secure,
      auth: user ? { user, pass } : undefined,
      connectionTimeout: SMTP_TIMEOUT_MS,
      greetingTimeout: SMTP_TIMEOUT_MS,
      socketTimeout: SMTP_TIMEOUT_MS,
    });
  }

  async sendOtp(email: string, otp: string): Promise<Result<void, Error>> {
    try {
      await this.transporter.sendMail({
        from: this.from,
        to: email,
        subject: 'Mã xác thực đăng ký',
        text: `Mã OTP của bạn là ${otp}. Mã chỉ có hiệu lực trong thời gian ngắn, không chia sẻ cho bất kỳ ai.`,
        html: `
          <p>Mã OTP của bạn là:</p>
          <h2 style="letter-spacing:4px">${otp}</h2>
          <p>Mã chỉ có hiệu lực trong thời gian ngắn, không chia sẻ cho bất kỳ ai.</p>
        `,
      });
      return ok(undefined);
    } catch (error) {
      this.logger.error(error instanceof Error ? error.message : String(error));
      return err(new Error('Failed to send email.'));
    }
  }
}

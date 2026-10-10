import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';
import { SmtpEmailSender } from './smtp-email-sender';

jest.mock('nodemailer');

describe('SmtpEmailSender', () => {
  const sendMail = jest.fn();
  const mockedCreateTransport = jest.mocked(createTransport);

  const mailpitEnv: Record<string, string> = {
    MAIL_HOST: 'localhost',
    MAIL_PORT: '1025',
    MAIL_SECURE: 'false',
    MAIL_USER: '',
    MAIL_PASSWORD: '',
    MAIL_FROM: 'InterviewIQ <no-reply@interviewiq.local>',
  };

  const buildConfig = (env: Record<string, string | undefined>) =>
    ({
      get: (key: string) => env[key],
      getOrThrow: (key: string) => {
        const value = env[key];
        if (value === undefined) throw new Error(`Missing ${key}`);
        return value;
      },
    }) as unknown as ConfigService;

  const buildSender = (env: Record<string, string | undefined> = mailpitEnv) =>
    new SmtpEmailSender(buildConfig(env));

  let loggerError: jest.SpyInstance;

  beforeEach(() => {
    jest.resetAllMocks();
    mockedCreateTransport.mockReturnValue({
      sendMail,
    } as unknown as Transporter);
    loggerError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  describe('constructor', () => {
    it('creates the transporter with typed values, no auth and timeouts for Mailpit', () => {
      buildSender();

      expect(mockedCreateTransport).toHaveBeenCalledWith({
        host: 'localhost',
        port: 1025,
        secure: false,
        auth: undefined,
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 10_000,
      });
    });

    it('enables secure mode and auth when credentials are configured', () => {
      buildSender({
        ...mailpitEnv,
        MAIL_HOST: 'smtp.gmail.com',
        MAIL_PORT: '465',
        MAIL_SECURE: 'true',
        MAIL_USER: 'bot@gmail.com',
        MAIL_PASSWORD: 'app-password',
      });

      expect(mockedCreateTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          port: 465,
          secure: true,
          auth: { user: 'bot@gmail.com', pass: 'app-password' },
        }),
      );
    });

    it.each([
      ['MAIL_HOST is missing', { MAIL_HOST: undefined }],
      ['MAIL_FROM is missing', { MAIL_FROM: undefined }],
      ['MAIL_PORT is missing', { MAIL_PORT: undefined }],
      ['MAIL_PORT is not a number', { MAIL_PORT: 'abc' }],
    ])('throws when %s', (_case, override) => {
      expect(() => buildSender({ ...mailpitEnv, ...override })).toThrow();
      expect(mockedCreateTransport).not.toHaveBeenCalled();
    });
  });

  describe('sendOtp', () => {
    it('sends the otp from the configured sender to the given email', async () => {
      sendMail.mockResolvedValue({ messageId: 'id' });
      const sender = buildSender();

      const result = await sender.sendOtp('a@x.com', '012345');

      expect(result.isOk()).toBe(true);
      expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: mailpitEnv.MAIL_FROM,
          to: 'a@x.com',
          text: expect.stringContaining('012345') as string,
          html: expect.stringContaining('012345') as string,
        }),
      );
    });

    it('returns a safe error when sending fails', async () => {
      sendMail.mockRejectedValue(new Error('smtp internal detail'));
      const sender = buildSender();

      const result = await sender.sendOtp('a@x.com', '012345');

      if (result.isOk()) throw new Error('Expected an error result');
      expect(result.error.message).not.toContain('smtp internal detail');
    });

    it('never writes the otp to the error log', async () => {
      sendMail.mockRejectedValue(new Error('connection refused'));
      const sender = buildSender();

      await sender.sendOtp('a@x.com', '012345');

      expect(loggerError).toHaveBeenCalled();
      const logged = JSON.stringify(loggerError.mock.calls);
      expect(logged).not.toContain('012345');
    });
  });
});

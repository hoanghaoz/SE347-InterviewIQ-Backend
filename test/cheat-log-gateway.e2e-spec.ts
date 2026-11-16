import { INestApplication } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { err, ok } from 'neverthrow';
import { io, type Socket } from 'socket.io-client';
import { InterviewCheatLogGateway } from '../src/modules/interview/api/interview-cheat-log.gateway';
import { ICheatLogService } from '../src/modules/interview/application/interfaces/cheat-log.service.interface';
import { AppError, ErrorCode } from '../src/shared/common/errorCode';

describe('InterviewCheatLogGateway (e2e)', () => {
  let app: INestApplication;
  let url: string;
  let jwt: JwtService;
  let token: string;
  let client: Socket | undefined;
  const recordCheatEventAsync = jest.fn();
  const userId = '00000000-0000-4000-8000-000000000001';
  const sessionId = '00000000-0000-4000-8000-000000000002';
  const body = {
    eventType: 'TAB_SWITCH',
    occurredAt: '2026-11-09T10:05:00.000Z',
    description: 'Switched tab',
  };
  const message = { sessionPublicId: sessionId, ...body };
  const log = {
    id: '00000000-0000-4000-8000-000000000003',
    eventType: 'TAB_SWITCH',
    description: 'Switched tab',
    occurredAt: '2026-11-09T10:05:00.000Z',
    createdAt: '2026-11-09T10:05:01.000Z',
  };
  const summary = {
    totalCount: 1,
    countsByType: {
      TAB_SWITCH: 1,
      WINDOW_BLUR: 0,
      FACE_MISSING: 0,
      MULTIPLE_FACES: 0,
    },
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    recordCheatEventAsync.mockResolvedValue(ok({ log, summary }));
    const module = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'test-secret' })],
      providers: [
        InterviewCheatLogGateway,
        { provide: ICheatLogService, useValue: { recordCheatEventAsync } },
      ],
    }).compile();
    jwt = module.get(JwtService);
    token = jwt.sign({ sub: userId, role: 'USER' });
    app = module.createNestApplication();
    await app.listen(0);
    url = `${await app.getUrl()}/cheat-logs`.replace('[::1]', 'localhost');
  });

  afterEach(async () => {
    client?.disconnect();
    client = undefined;
    await app.close();
  });

  const connect = (auth?: Record<string, unknown>, extraHeaders = {}) =>
    new Promise<Socket>((resolve, reject) => {
      const socket = io(url, {
        auth,
        extraHeaders,
        transports: ['websocket'],
        reconnection: false,
      });
      client = socket;
      socket.on('connect', () => resolve(socket));
      socket.on('connect_error', reject);
    });

  const record = (socket: Socket, payload: unknown = message) =>
    socket.timeout(2000).emitWithAck('cheat-log:record', payload) as Promise<
      Record<string, unknown>
    >;

  it('acks the created log and summary with the REST envelope', async () => {
    const socket = await connect({ token });

    const ack = await record(socket);

    expect(ack).toMatchObject({
      statusCode: 201,
      success: true,
      data: { log, summary },
      message: 'Cheat event recorded',
    });
    expect(recordCheatEventAsync).toHaveBeenCalledWith(userId, sessionId, body);
  });

  it('accepts the token from the Authorization header', async () => {
    const socket = await connect(undefined, {
      Authorization: `Bearer ${token}`,
    });

    await expect(record(socket)).resolves.toMatchObject({ success: true });
  });

  it('rejects a handshake without a token', async () => {
    await expect(connect()).rejects.toThrow('Unauthorized');
    expect(recordCheatEventAsync).not.toHaveBeenCalled();
  });

  it('rejects a handshake with an invalid token', async () => {
    await expect(connect({ token: 'not-a-jwt' })).rejects.toThrow(
      'Unauthorized',
    );
  });

  it('rejects a handshake with a role that is not allowed', async () => {
    const other = jwt.sign({ sub: userId, role: 'GUEST' });

    await expect(connect({ token: other })).rejects.toThrow('Unauthorized');
  });

  it('acks validation errors with field details and skips the service', async () => {
    const socket = await connect({ token });

    const ack = await record(socket, {
      ...message,
      eventType: 'NOT_A_TYPE',
      sessionPublicId: 'nope',
    });

    expect(ack).toMatchObject({
      statusCode: 400,
      success: false,
      code: 'BAD_REQUEST',
      message: 'Request validation failed',
      path: 'cheat-log:record',
    });
    expect(ack.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'eventType' }),
        expect.objectContaining({ field: 'sessionPublicId' }),
      ]),
    );
    expect(recordCheatEventAsync).not.toHaveBeenCalled();
  });

  it.each([
    [ErrorCode.NotFound, 404],
    [ErrorCode.Conflict, 409],
    [ErrorCode.BadRequest, 400],
  ])('acks a %s service error as status %i', async (code, statusCode) => {
    recordCheatEventAsync.mockResolvedValue(err(new AppError(code, 'nope')));
    const socket = await connect({ token });

    const ack = await record(socket);

    expect(ack).toMatchObject({
      statusCode,
      success: false,
      code,
      message: 'nope',
    });
  });

  it('keeps the connection usable after an error', async () => {
    recordCheatEventAsync.mockResolvedValueOnce(
      err(new AppError(ErrorCode.NotFound, 'missing')),
    );
    const socket = await connect({ token });

    await expect(record(socket)).resolves.toMatchObject({ success: false });
    await expect(record(socket)).resolves.toMatchObject({ success: true });
  });
});

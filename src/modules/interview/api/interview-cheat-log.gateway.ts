import { HttpStatus, Logger, UseFilters, UsePipes } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  type OnGatewayInit,
} from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import { toHttpException } from '../../../shared/common/app-error.mapper';
import { CommonUserRole } from '../../../shared/common/commonEnum';
import { CORS_ORIGINS } from '../../../shared/common/cors.config';
import type { JwtPayload } from '../../../shared/common/jwt.payload.interface';
import { createValidationPipe } from '../../../shared/common/validation-pipe.factory';
import { WsAllExceptionsFilter } from '../../../shared/common/ws-exceptions.filter';
import { ApiSuccessResponse } from '../../../shared/response/apiResponse';
import { RecordCheatLogMessageDto } from '../application/dtos/cheat-log.message.dto';
import { CheatLogCreatedResponseDto } from '../application/dtos/cheat-log.response.dto';
import { ICheatLogService } from '../application/interfaces/cheat-log.service.interface';

export const CHEAT_LOG_NAMESPACE = 'cheat-logs';
export const CHEAT_LOG_RECORD_EVENT = 'cheat-log:record';

const ALLOWED_ROLES: readonly CommonUserRole[] = [
  CommonUserRole.ADMIN,
  CommonUserRole.USER,
];

/**
 * Realtime twin of `POST /api/interview-session/:id/cheat-logs`. The client
 * connects to the `cheat-logs` namespace with its access token (handshake
 * `auth.token`, or an `Authorization: Bearer` header), emits `cheat-log:record`
 * and waits for the ack, which is the same envelope the REST route returns.
 * All rules live in `ICheatLogService`; this class is only transport.
 */
@WebSocketGateway({
  namespace: CHEAT_LOG_NAMESPACE,
  cors: { origin: CORS_ORIGINS, credentials: true },
})
@UseFilters(WsAllExceptionsFilter)
@UsePipes(createValidationPipe())
export class InterviewCheatLogGateway implements OnGatewayInit<Namespace> {
  private readonly logger = new Logger(InterviewCheatLogGateway.name);

  constructor(
    private readonly cheatLogService: ICheatLogService,
    private readonly jwtService: JwtService,
  ) {}

  afterInit(namespace: Namespace): void {
    namespace.use((socket, next) => {
      void this.authenticateAsync(socket).then(
        () => next(),
        (error: Error) => {
          this.logger.warn(`Rejected socket handshake: ${error.message}`);
          next(new Error('Unauthorized'));
        },
      );
    });
  }

  @SubscribeMessage(CHEAT_LOG_RECORD_EVENT)
  async recordCheatEventAsync(
    @ConnectedSocket() client: Socket,
    @MessageBody() message: RecordCheatLogMessageDto,
  ): Promise<ApiSuccessResponse<CheatLogCreatedResponseDto>> {
    const user = client.data as JwtPayload;
    const { sessionPublicId, ...request } = message;
    const result = await this.cheatLogService.recordCheatEventAsync(
      user.sub,
      sessionPublicId,
      request,
    );
    return result.match(
      (data) =>
        new ApiSuccessResponse(
          HttpStatus.CREATED,
          data,
          'Cheat event recorded',
        ),
      (error) => {
        throw toHttpException(error);
      },
    );
  }

  private async authenticateAsync(socket: Socket): Promise<void> {
    const token = extractToken(socket);
    if (!token) throw new Error('No token provided');

    const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
    if (!ALLOWED_ROLES.includes(payload.role)) {
      throw new Error('Role not allowed');
    }
    // socket.data is the per-connection store; handlers read the caller from it.
    Object.assign(socket.data as object, payload);
  }
}

function extractToken(socket: Socket): string | undefined {
  const authToken: unknown = (socket.handshake.auth as { token?: unknown })
    .token;
  if (typeof authToken === 'string' && authToken.length > 0) return authToken;

  const [type, token] =
    socket.handshake.headers.authorization?.split(' ') ?? [];
  return type === 'Bearer' ? token : undefined;
}

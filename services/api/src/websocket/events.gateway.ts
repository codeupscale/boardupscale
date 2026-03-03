import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger, UnauthorizedException } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  namespace: '/',
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(EventsGateway.name);

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        this.logger.warn(`Client ${client.id} connected without token`);
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('jwt.secret'),
      });

      client.data.userId = payload.sub;
      client.data.organizationId = payload.organizationId;
      client.data.role = payload.role;

      const orgRoom = `org:${payload.organizationId}`;
      await client.join(orgRoom);
      await client.join(`user:${payload.sub}`);

      this.logger.log(`Client ${client.id} connected (user: ${payload.sub}, org: ${payload.organizationId})`);
    } catch (err) {
      this.logger.warn(`Client ${client.id} authentication failed: ${err.message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client ${client.id} disconnected`);
  }

  @SubscribeMessage('join:project')
  async handleJoinProject(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { projectId: string },
  ) {
    if (!data?.projectId) return;
    const room = `project:${data.projectId}`;
    await client.join(room);
    this.logger.log(`Client ${client.id} joined project room: ${room}`);
    client.emit('joined:project', { projectId: data.projectId });
  }

  @SubscribeMessage('leave:project')
  async handleLeaveProject(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { projectId: string },
  ) {
    if (!data?.projectId) return;
    const room = `project:${data.projectId}`;
    await client.leave(room);
    client.emit('left:project', { projectId: data.projectId });
  }

  emitToOrg(organizationId: string, event: string, data: any) {
    this.server.to(`org:${organizationId}`).emit(event, data);
  }

  emitToUser(userId: string, event: string, data: any) {
    this.server.to(`user:${userId}`).emit(event, data);
  }

  emitToProject(projectId: string, event: string, data: any) {
    this.server.to(`project:${projectId}`).emit(event, data);
  }
}

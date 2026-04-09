import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  namespace: '/',
  pingInterval: 25000,
  pingTimeout: 20000,
  connectTimeout: 10000,
  transports: ['websocket', 'polling'],
})
export class EventsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(EventsGateway.name);
  private connectedUsers = new Map<string, Set<string>>(); // userId → Set<socketId>

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  afterInit(server: Server) {
    // Attempt Redis adapter for multi-instance scalability
    this.initRedisAdapter(server);
    // Subscribe to worker notification events via Redis pub/sub
    this.subscribeToWorkerNotifications();
    this.logger.log('WebSocket Gateway initialized');
  }

  private async initRedisAdapter(server: Server) {
    try {
      const redisUrl = this.configService.get<string>('redis.url');
      if (!redisUrl) return;

      const { createAdapter } = await import('@socket.io/redis-adapter');
      const { createClient } = await import('redis');

      const pubClient = createClient({ url: redisUrl });
      const subClient = pubClient.duplicate();

      await Promise.all([pubClient.connect(), subClient.connect()]);
      server.adapter(createAdapter(pubClient, subClient));

      this.logger.log('Socket.io Redis adapter enabled (multi-instance ready)');
    } catch (err: any) {
      this.logger.warn(`Redis adapter not available: ${err.message} — running single-instance mode`);
    }
  }

  /**
   * Subscribe to Redis pub/sub channel for notifications created by the worker.
   * Relays them to connected WebSocket clients so they appear in real-time
   * without requiring polling.
   */
  private async subscribeToWorkerNotifications() {
    try {
      const redisUrl = this.configService.get<string>('redis.url');
      if (!redisUrl) return;

      const IORedis = (await import('ioredis')).default;
      const subClient = new IORedis(redisUrl);

      subClient.subscribe('notifications:new', (err) => {
        if (err) {
          this.logger.warn(`Failed to subscribe to notifications:new: ${err.message}`);
          return;
        }
        this.logger.log('Subscribed to Redis channel: notifications:new');
      });

      subClient.on('message', (_channel: string, message: string) => {
        try {
          const data = JSON.parse(message);
          const userId = data.user_id;
          if (!userId) return;

          // Emit notification to user's WebSocket room
          this.emitToUser(userId, 'notification:new', {
            id: data.id,
            type: data.type,
            title: data.title,
            body: data.body,
            data: data.data,
            read: false,
            createdAt: data.created_at,
          });

          // Emit a count update request — the client will use cached count + 1
          // (avoids a DB query per worker notification on the gateway)
          this.emitToUser(userId, 'notification:count-increment', {});
        } catch (err: any) {
          this.logger.warn(`Failed to parse notification message: ${err.message}`);
        }
      });
    } catch (err: any) {
      this.logger.warn(`Worker notification subscription failed: ${err.message}`);
    }
  }

  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        this.logger.warn(`Client ${client.id} connected without token — disconnecting`);
        client.emit('error', { message: 'Authentication required' });
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('jwt.secret'),
      });

      const userId = payload.sub;
      const organizationId = payload.organizationId;

      client.data.userId = userId;
      client.data.organizationId = organizationId;
      client.data.role = payload.role;

      // Join personal and org rooms
      await client.join(`user:${userId}`);
      await client.join(`org:${organizationId}`);

      // Track connected users
      if (!this.connectedUsers.has(userId)) {
        this.connectedUsers.set(userId, new Set());
      }
      this.connectedUsers.get(userId)!.add(client.id);

      // Send connection confirmation with user data
      client.emit('connected', {
        userId,
        organizationId,
        socketId: client.id,
      });

      this.logger.log(`Client ${client.id} connected (user: ${userId})`);
    } catch (err: any) {
      this.logger.warn(`Client ${client.id} auth failed: ${err.message}`);
      client.emit('error', { message: 'Invalid or expired token' });
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.data?.userId;
    if (userId && this.connectedUsers.has(userId)) {
      this.connectedUsers.get(userId)!.delete(client.id);
      if (this.connectedUsers.get(userId)!.size === 0) {
        this.connectedUsers.delete(userId);
      }
    }
    this.logger.debug(`Client ${client.id} disconnected`);
  }

  // ── Room Management ──

  @SubscribeMessage('join:project')
  async handleJoinProject(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { projectId: string },
  ) {
    if (!data?.projectId || !client.data.userId) return;
    const room = `project:${data.projectId}`;
    await client.join(room);
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

  // ── Ping/Pong (client keepalive) ──

  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: Socket) {
    client.emit('pong', { ts: Date.now() });
  }

  // ── Emit Helpers ──

  emitToOrg(organizationId: string, event: string, data: any) {
    this.server.to(`org:${organizationId}`).emit(event, data);
  }

  emitToUser(userId: string, event: string, data: any) {
    this.server.to(`user:${userId}`).emit(event, data);
  }

  emitToProject(projectId: string, event: string, data: any) {
    this.server.to(`project:${projectId}`).emit(event, data);
  }

  // ── Stats ──

  getOnlineUserCount(): number {
    return this.connectedUsers.size;
  }

  isUserOnline(userId: string): boolean {
    return this.connectedUsers.has(userId);
  }
}

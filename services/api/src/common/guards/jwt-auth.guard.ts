import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Composite auth guard that accepts either JWT bearer token or X-API-Key header.
 * If the request has an X-API-Key header, it uses the 'api-key' strategy.
 * Otherwise, it falls back to the standard 'jwt' strategy.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard(['jwt', 'api-key']) {
  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any) {
    if (err || !user) {
      throw err || new UnauthorizedException('Invalid or expired token');
    }
    return user;
  }

  getRequest(context: ExecutionContext) {
    return context.switchToHttp().getRequest();
  }
}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RefreshToken } from './entities/refresh-token.entity';
import { Organization } from '../organizations/entities/organization.entity';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LocalStrategy } from './strategies/local.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { GithubStrategy } from './strategies/github.strategy';
import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';

// Conditionally include OAuth strategies only when credentials are configured
const oauthProviders = [];

function getOAuthProviders(): any[] {
  const providers: any[] = [];
  if (process.env.GOOGLE_CLIENT_ID) {
    providers.push(GoogleStrategy);
  }
  if (process.env.GITHUB_CLIENT_ID) {
    providers.push(GithubStrategy);
  }
  return providers;
}

@Module({
  imports: [
    TypeOrmModule.forFeature([RefreshToken, Organization]),
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('jwt.secret'),
        signOptions: { expiresIn: configService.get<string>('jwt.expiry') },
      }),
      inject: [ConfigService],
    }),
    UsersModule,
    NotificationsModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, LocalStrategy, ...getOAuthProviders()],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}

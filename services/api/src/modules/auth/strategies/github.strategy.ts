import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-github2';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';

@Injectable()
export class GithubStrategy extends PassportStrategy(Strategy, 'github') {
  constructor(
    private configService: ConfigService,
    private authService: AuthService,
  ) {
    super({
      clientID: configService.get<string>('oauth.github.clientId'),
      clientSecret: configService.get<string>('oauth.github.clientSecret'),
      callbackURL: configService.get<string>('oauth.github.callbackUrl'),
      scope: ['user:email'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: (err: any, user?: any) => void,
  ) {
    const email =
      profile.emails?.[0]?.value ||
      (profile._json && profile._json.email);
    const displayName =
      profile.displayName || profile.username || 'GitHub User';
    const avatarUrl = profile.photos?.[0]?.value || profile._json?.avatar_url || null;

    const user = await this.authService.findOrCreateOAuthUser('github', {
      oauthId: profile.id,
      email,
      displayName,
      avatarUrl,
    });

    done(null, user);
  }
}

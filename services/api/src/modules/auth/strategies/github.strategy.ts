import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-github2';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';

@Injectable()
export class GithubStrategy extends PassportStrategy(Strategy, 'github') {
  private readonly logger = new Logger(GithubStrategy.name);

  constructor(
    private configService: ConfigService,
    private authService: AuthService,
  ) {
    super({
      clientID: configService.get<string>('oauth.github.clientId'),
      clientSecret: configService.get<string>('oauth.github.clientSecret'),
      callbackURL: configService.get<string>('oauth.github.callbackUrl'),
      scope: ['user:email'],
      allRawEmails: true,
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: (err: any, user?: any) => void,
  ) {
    // Try multiple sources for email
    let email =
      profile.emails?.[0]?.value ||
      (profile._json && profile._json.email);

    // If passport-github2 couldn't fetch emails, try GitHub API directly
    if (!email && accessToken) {
      try {
        const response = await fetch('https://api.github.com/user/emails', {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/vnd.github+json',
          },
        });
        if (response.ok) {
          const emails = await response.json();
          const primary = emails.find((e: any) => e.primary) || emails[0];
          email = primary?.email;
        }
      } catch (err) {
        this.logger.warn('Could not fetch emails from GitHub API directly');
      }
    }

    // Last resort: use noreply email from GitHub
    if (!email) {
      email = `${profile.id}+${profile.username}@users.noreply.github.com`;
      this.logger.warn(`No email found for GitHub user ${profile.username}, using noreply: ${email}`);
    }

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

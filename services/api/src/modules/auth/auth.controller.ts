import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
  Request,
  Response,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { SamlService } from './saml.service';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { Verify2FADto } from './dto/verify-2fa.dto';
import { Confirm2FADto } from './dto/confirm-2fa.dto';
import { Disable2FADto } from './dto/disable-2fa.dto';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { GithubAuthGuard } from './guards/github-auth.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { StrictThrottle } from '../../common/decorators/throttle.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private authService: AuthService,
    private samlService: SamlService,
    private usersService: UsersService,
    private configService: ConfigService,
  ) {}

  @Post('register')
  @StrictThrottle()
  @ApiOperation({ summary: 'Register a new user and organization' })
  @ApiResponse({ status: 201, description: 'User registered successfully' })
  @ApiResponse({ status: 409, description: 'Email already registered' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async register(@Body() dto: RegisterDto, @Request() req: any) {
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];
    return this.authService.register(dto, ipAddress, userAgent);
  }

  @Post('login')
  @StrictThrottle()
  @UseGuards(LocalAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async login(@Request() req: any) {
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];
    return this.authService.login(req.user, ipAddress, userAgent);
  }

  @Post('refresh')
  @StrictThrottle()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token using refresh token' })
  @ApiResponse({ status: 200, description: 'Token refreshed successfully' })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async refresh(@Body() body: { refreshToken: string }, @Request() req: any) {
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];
    return this.authService.refreshToken(body.refreshToken, ipAddress, userAgent);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout and revoke refresh token' })
  @ApiResponse({ status: 200, description: 'Logged out successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async logout(@CurrentUser() user: any, @Body() body: { refreshToken?: string }) {
    await this.authService.logout(user.id, body.refreshToken);
    return { message: 'Logged out successfully' };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current authenticated user' })
  @ApiResponse({ status: 200, description: 'Current user profile' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async me(@CurrentUser() user: any) {
    const fullUser = await this.usersService.findById(user.id);
    return { data: fullUser };
  }

  // ── Email Verification ──────────────────────────────────────────────────

  @Post('send-verification')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send or resend email verification link' })
  async sendVerification(@CurrentUser() user: any) {
    return this.authService.resendVerificationEmail(user.id);
  }

  @Get('verify-email')
  @ApiOperation({ summary: 'Verify email address using token' })
  async verifyEmail(@Query('token') token: string) {
    return this.authService.verifyEmail(token);
  }

  // ── Invitation Accept ──────────────────────────────────────────────────

  @Get('validate-invite')
  @ApiOperation({ summary: 'Validate an invitation token and return email' })
  async validateInvite(@Query('token') token: string) {
    return this.authService.validateInvitation(token);
  }

  @Post('accept-invite')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept an invitation, set password, and login' })
  async acceptInvite(@Body() dto: AcceptInviteDto, @Request() req: any) {
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];
    return this.authService.acceptInvitation(
      dto.token,
      dto.password,
      dto.displayName,
      ipAddress,
      userAgent,
    );
  }

  // ── Password Reset ──────────────────────────────────────────────────────

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request a password reset link' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password using reset token' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.newPassword);
  }

  // ── Two-Factor Authentication ────────────────────────────────────────

  @Post('2fa/setup')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate 2FA secret and QR code' })
  async setup2FA(@CurrentUser() user: any) {
    return this.authService.setupTwoFactor(user.id);
  }

  @Post('2fa/confirm')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm 2FA setup with TOTP code' })
  async confirm2FA(@CurrentUser() user: any, @Body() dto: Confirm2FADto) {
    return this.authService.confirmTwoFactor(user.id, dto.code);
  }

  @Post('2fa/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify 2FA code during login' })
  async verify2FA(@Body() dto: Verify2FADto, @Request() req: any) {
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];
    return this.authService.verifyTwoFactor(dto.tempToken, dto.code, ipAddress, userAgent);
  }

  @Post('2fa/disable')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Disable 2FA' })
  async disable2FA(@CurrentUser() user: any, @Body() dto: Disable2FADto) {
    return this.authService.disableTwoFactor(user.id, dto.password);
  }

  @Post('2fa/backup-codes')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Regenerate backup codes' })
  async regenerateBackupCodes(@CurrentUser() user: any, @Body() dto: Disable2FADto) {
    return this.authService.regenerateBackupCodes(user.id, dto.password);
  }

  // ── Auth Providers (public) ──────────────────────────────────────────

  @Get('providers')
  @ApiOperation({ summary: 'List available authentication providers' })
  @ApiResponse({ status: 200, description: 'Available auth providers' })
  async getProviders() {
    return {
      google: !!this.configService.get<string>('oauth.google.clientId'),
      github: !!this.configService.get<string>('oauth.github.clientId'),
      saml: !!this.configService.get<string>('saml.entryPoint'),
    };
  }

  // ── Google OAuth ──────────────────────────────────────────────────────

  @Get('google')
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({ summary: 'Initiate Google OAuth login' })
  async googleAuth() {
    // Guard redirects to Google
  }

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({ summary: 'Google OAuth callback' })
  async googleCallback(@Request() req: any, @Response() res: any) {
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];
    const tokens = await this.authService.generateTokens(
      req.user,
      ipAddress,
      userAgent,
    );
    const frontendUrl = this.configService.get<string>('app.frontendUrl');
    const params = new URLSearchParams({
      token: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
    return res.redirect(`${frontendUrl}/auth/callback?${params.toString()}`);
  }

  // ── GitHub OAuth ──────────────────────────────────────────────────────

  @Get('github')
  @UseGuards(GithubAuthGuard)
  @ApiOperation({ summary: 'Initiate GitHub OAuth login' })
  async githubAuth() {
    // Guard redirects to GitHub
  }

  @Get('github/callback')
  @UseGuards(GithubAuthGuard)
  @ApiOperation({ summary: 'GitHub OAuth callback' })
  async githubCallback(@Request() req: any, @Response() res: any) {
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];
    const tokens = await this.authService.generateTokens(
      req.user,
      ipAddress,
      userAgent,
    );
    const frontendUrl = this.configService.get<string>('app.frontendUrl');
    const params = new URLSearchParams({
      token: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
    return res.redirect(`${frontendUrl}/auth/callback?${params.toString()}`);
  }

  // ── SAML SSO ───────────────────────────────────────────────────────────

  @Get('saml')
  @ApiOperation({ summary: 'Initiate SAML SSO login' })
  @ApiResponse({ status: 302, description: 'Redirects to IdP' })
  @ApiResponse({ status: 400, description: 'SAML not configured or invalid org slug' })
  async samlLogin(
    @Query('orgSlug') orgSlug: string,
    @Response() res: any,
  ) {
    if (!orgSlug) {
      return res.status(400).json({ message: 'orgSlug query parameter is required' });
    }

    const redirectUrl = await this.samlService.initiateSamlLogin(orgSlug);
    return res.redirect(redirectUrl);
  }

  @Post('saml/callback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'SAML Assertion Consumer Service (ACS) callback' })
  @ApiResponse({ status: 302, description: 'Redirects to frontend with tokens' })
  @ApiResponse({ status: 401, description: 'SAML authentication failed' })
  async samlCallback(@Request() req: any, @Response() res: any) {
    const samlResponse = req.body?.SAMLResponse;
    const relayState = req.body?.RelayState;

    if (!samlResponse) {
      const frontendUrl = this.configService.get<string>('app.frontendUrl');
      return res.redirect(
        `${frontendUrl}/login?error=${encodeURIComponent('Invalid SAML response')}`,
      );
    }

    try {
      const { profile, orgId } = await this.samlService.handleSamlCallback(
        samlResponse,
        relayState,
      );

      // Find or create the user in the organization
      const user = await this.authService.findOrCreateSamlUser(orgId, {
        email: profile.email,
        displayName: profile.displayName,
      });

      const ipAddress = req.ip || req.connection.remoteAddress;
      const userAgent = req.headers['user-agent'];
      const tokens = await this.authService.generateTokens(
        user,
        ipAddress,
        userAgent,
      );

      const frontendUrl = this.configService.get<string>('app.frontendUrl');
      const params = new URLSearchParams({
        token: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      });
      return res.redirect(
        `${frontendUrl}/auth/saml/callback?${params.toString()}`,
      );
    } catch (err) {
      this.logger.error(`SAML callback error: ${err.message}`, err.stack);
      const frontendUrl = this.configService.get<string>('app.frontendUrl');
      return res.redirect(
        `${frontendUrl}/login?error=${encodeURIComponent(err.message || 'SAML authentication failed')}`,
      );
    }
  }

  @Get('saml/metadata')
  @ApiOperation({ summary: 'Get SAML SP metadata XML' })
  @ApiResponse({ status: 200, description: 'SP metadata XML' })
  async samlMetadata(
    @Query('orgSlug') orgSlug: string,
    @Response() res: any,
  ) {
    const metadata = await this.samlService.getMetadata(orgSlug);
    res.set('Content-Type', 'application/xml');
    return res.send(metadata);
  }

  @Get('saml/status')
  @ApiOperation({ summary: 'Check if SAML SSO is configured for an organization' })
  @ApiResponse({ status: 200, description: 'SAML configuration status' })
  async samlStatus(@Query('orgSlug') orgSlug: string) {
    if (!orgSlug) {
      return { configured: false };
    }
    const configured = await this.samlService.isSamlConfigured(orgSlug);
    return { configured };
  }
}

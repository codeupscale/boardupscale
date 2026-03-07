import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Request,
  Response,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { GithubAuthGuard } from './guards/github-auth.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { StrictThrottle } from '../../common/decorators/throttle.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
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

  // ── Google OAuth ──────────────────────────────────────────────────

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

  // ── GitHub OAuth ──────────────────────────────────────────────────

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
}

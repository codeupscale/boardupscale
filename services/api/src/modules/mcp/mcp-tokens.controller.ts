import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OrgId } from '../../common/decorators/org-id.decorator';
import { ParseUUIDPipe } from '../../common/pipes/parse-uuid.pipe';
import { ApiKeysService } from '../api-keys/api-keys.service';
import { CreateMcpTokenDto } from './dto/create-mcp-token.dto';

const DEFAULT_EXPIRY_DAYS = 90;

/**
 * Personal MCP tokens. Any org member may manage their own tokens — a token
 * only ever grants access the user already has in the browser.
 */
@ApiTags('mcp')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('mcp/tokens')
export class McpTokensController {
  constructor(private apiKeysService: ApiKeysService) {}

  @Get()
  @ApiOperation({ summary: 'List your MCP tokens' })
  async findAll(@CurrentUser() user: any, @OrgId() orgId: string) {
    this.assertInteractiveSession(user);
    const tokens = await this.apiKeysService.findMcpTokensByUser(user.id, orgId);
    return {
      data: tokens.map((t) => ({
        id: t.id,
        name: t.name,
        keyPrefix: t.keyPrefix,
        scopes: t.scopes,
        lastUsedAt: t.lastUsedAt,
        expiresAt: t.expiresAt,
        createdAt: t.createdAt,
      })),
    };
  }

  @Post()
  @ApiOperation({
    summary: 'Create an MCP token. The raw token is returned only once.',
  })
  async create(@Body() dto: CreateMcpTokenDto, @CurrentUser() user: any, @OrgId() orgId: string) {
    this.assertInteractiveSession(user);
    const { apiKey, rawKey } = await this.apiKeysService.createMcpToken(
      user.id,
      orgId,
      dto.name,
      dto.expiresInDays ?? DEFAULT_EXPIRY_DAYS,
      dto.allowWrite ?? false,
    );
    return {
      data: {
        id: apiKey.id,
        name: apiKey.name,
        keyPrefix: apiKey.keyPrefix,
        scopes: apiKey.scopes,
        expiresAt: apiKey.expiresAt,
        createdAt: apiKey.createdAt,
        token: rawKey,
      },
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke one of your MCP tokens' })
  async revoke(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
    @OrgId() orgId: string,
  ) {
    this.assertInteractiveSession(user);
    await this.apiKeysService.revokeOwnMcpToken(id, user.id, orgId);
  }

  /** Tokens must be managed from a signed-in session, never with another API key. */
  private assertInteractiveSession(user: any) {
    if (user?.apiKeyId) {
      throw new ForbiddenException('MCP tokens can only be managed from a signed-in session');
    }
  }
}

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PagesService } from './pages.service';
import { CreatePageDto } from './dto/create-page.dto';
import { UpdatePageDto, MovePageDto } from './dto/update-page.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OrgId } from '../../common/decorators/org-id.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ParseUUIDPipe } from '../../common/pipes/parse-uuid.pipe';

@ApiTags('pages')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('pages')
export class PagesController {
  constructor(private readonly pagesService: PagesService) {}

  // GET /api/pages/project/:projectId — page tree for a project
  @Get('project/:projectId')
  @RequirePermission('page', 'read')
  @ApiOperation({ summary: 'Get page tree for a project' })
  async findTree(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @OrgId() orgId: string,
  ) {
    return this.pagesService.findTree(projectId, orgId);
  }

  // GET /api/pages/:id — single page with full content
  @Get(':id')
  @RequirePermission('page', 'read')
  @ApiOperation({ summary: 'Get a single page' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @OrgId() orgId: string,
  ) {
    return this.pagesService.findById(id, orgId);
  }

  // GET /api/pages/:id/ancestors — breadcrumb trail
  @Get(':id/ancestors')
  @RequirePermission('page', 'read')
  @ApiOperation({ summary: 'Get ancestor chain (breadcrumb) for a page' })
  async findAncestors(
    @Param('id', ParseUUIDPipe) id: string,
    @OrgId() orgId: string,
  ) {
    return this.pagesService.findAncestors(id, orgId);
  }

  // POST /api/pages — create a new page
  @Post()
  @RequirePermission('page', 'create')
  @ApiOperation({ summary: 'Create a page' })
  async create(
    @Body() dto: CreatePageDto,
    @OrgId() orgId: string,
    @CurrentUser() user: any,
  ) {
    return this.pagesService.create(dto, orgId, user.id);
  }

  // PATCH /api/pages/:id — update title/content/icon
  @Patch(':id')
  @RequirePermission('page', 'update')
  @ApiOperation({ summary: 'Update a page' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePageDto,
    @OrgId() orgId: string,
    @CurrentUser() user: any,
  ) {
    return this.pagesService.update(id, orgId, dto, user.id);
  }

  // POST /api/pages/:id/move — move to different parent / reorder
  @Post(':id/move')
  @RequirePermission('page', 'update')
  @ApiOperation({ summary: 'Move a page to a different parent or position' })
  async move(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MovePageDto,
    @OrgId() orgId: string,
    @CurrentUser() user: any,
  ) {
    return this.pagesService.move(id, orgId, dto, user.id);
  }

  // DELETE /api/pages/:id — soft delete
  @Delete(':id')
  @RequirePermission('page', 'delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a page (and its children)' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @OrgId() orgId: string,
  ) {
    await this.pagesService.softDelete(id, orgId);
  }
}

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SavedViewsService } from './saved-views.service';
import { CreateSavedViewDto } from './dto/create-saved-view.dto';
import { UpdateSavedViewDto } from './dto/update-saved-view.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OrgId } from '../../common/decorators/org-id.decorator';
import { ParseUUIDPipe } from '../../common/pipes/parse-uuid.pipe';

@ApiTags('saved-views')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('saved-views')
export class SavedViewsController {
  constructor(private readonly savedViewsService: SavedViewsService) {}

  // GET /api/saved-views?projectId=xxx
  @Get()
  @ApiOperation({ summary: 'List saved views for a project' })
  async findAll(
    @Query('projectId', ParseUUIDPipe) projectId: string,
    @OrgId() orgId: string,
    @CurrentUser() user: any,
  ) {
    return this.savedViewsService.findAll(projectId, orgId, user.id);
  }

  // POST /api/saved-views?projectId=xxx
  @Post()
  @ApiOperation({ summary: 'Create a saved view' })
  async create(
    @Query('projectId', ParseUUIDPipe) projectId: string,
    @OrgId() orgId: string,
    @CurrentUser() user: any,
    @Body() dto: CreateSavedViewDto,
  ) {
    return this.savedViewsService.create(projectId, orgId, user.id, dto);
  }

  // PATCH /api/saved-views/:id
  @Patch(':id')
  @ApiOperation({ summary: 'Update a saved view' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @OrgId() orgId: string,
    @CurrentUser() user: any,
    @Body() dto: UpdateSavedViewDto,
  ) {
    return this.savedViewsService.update(id, orgId, user.id, dto);
  }

  // DELETE /api/saved-views/:id
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a saved view' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @OrgId() orgId: string,
    @CurrentUser() user: any,
  ) {
    return this.savedViewsService.remove(id, orgId, user.id);
  }
}

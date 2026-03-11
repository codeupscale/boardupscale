import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
  ApiResponse,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ImportService } from './import.service';
import { StartImportDto, PreviewImportDto } from './dto/import-jira.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OrgId } from '../../common/decorators/org-id.decorator';

@ApiTags('import')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('import')
export class ImportController {
  constructor(private importService: ImportService) {}

  @Post('jira/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
      fileFilter: (_req, file, cb) => {
        if (!file.originalname) {
          cb(new BadRequestException('Invalid file'), false);
        } else if (!file.originalname.toLowerCase().endsWith('.json')) {
          cb(new BadRequestException('Only JSON files are supported'), false);
        } else {
          cb(null, true);
        }
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
      required: ['file'],
    },
  })
  @ApiOperation({ summary: 'Upload a Jira export JSON file' })
  @ApiResponse({ status: 201, description: 'File uploaded successfully' })
  @ApiResponse({ status: 400, description: 'Invalid file' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }
    const filePath = await this.importService.uploadFile(file);
    return { data: { filePath } };
  }

  @Post('jira/preview')
  @ApiOperation({ summary: 'Preview a Jira import (summary of what will be imported)' })
  @ApiResponse({ status: 200, description: 'Import preview summary' })
  @ApiResponse({ status: 400, description: 'Invalid file or format' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async previewImport(
    @Body() dto: PreviewImportDto,
    @OrgId() organizationId: string,
  ) {
    const preview = await this.importService.previewImport(dto.filePath, organizationId);
    return { data: preview };
  }

  @Post('jira/start')
  @ApiOperation({ summary: 'Start a Jira import job' })
  @ApiResponse({ status: 201, description: 'Import job started' })
  @ApiResponse({ status: 400, description: 'Invalid file or parameters' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async startImport(
    @Body() dto: StartImportDto,
    @OrgId() organizationId: string,
    @CurrentUser() user: any,
  ) {
    const jobId = await this.importService.startImport(dto, organizationId, user.id);
    return { data: { jobId } };
  }

  @Get('jira/status/:jobId')
  @ApiOperation({ summary: 'Get the status of a Jira import job' })
  @ApiResponse({ status: 200, description: 'Import job status' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getImportStatus(@Param('jobId') jobId: string) {
    const status = await this.importService.getImportStatus(jobId);
    return { data: status };
  }
}

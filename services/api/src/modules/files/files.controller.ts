import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Redirect,
  HttpCode,
  HttpStatus,
  BadRequestException,
  Header,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { FilesService } from './files.service';
import { UploadFileDto } from './dto/upload-file.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OrgId } from '../../common/decorators/org-id.decorator';
import { ParseUUIDPipe } from '../../common/pipes/parse-uuid.pipe';

@ApiTags('files')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('files')
export class FilesController {
  constructor(private filesService: FilesService) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 50 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!file.originalname) {
          cb(new BadRequestException('Invalid file'), false);
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
        issueId: { type: 'string' },
        commentId: { type: 'string' },
      },
    },
  })
  @ApiOperation({ summary: 'Upload a file attachment' })
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadFileDto,
    @CurrentUser() user: any,
  ) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }
    return this.filesService.upload(file, dto, user.id);
  }

  @Get(':id/view')
  @ApiOperation({ summary: 'Stream file content (permanent URL for embedding)' })
  async viewFile(
    @Param('id', ParseUUIDPipe) id: string,
    @OrgId() organizationId: string,
    @Res() res: Response,
  ) {
    const { stream, mimeType, fileName, fileSize } = await this.filesService.streamFile(id, organizationId);

    res.set({
      'Content-Type': mimeType,
      'Content-Disposition': `inline; filename="${encodeURIComponent(fileName)}"`,
      'Content-Length': String(fileSize),
      'Cache-Control': 'private, max-age=86400, immutable',
      'X-Content-Type-Options': 'nosniff',
    });

    stream.pipe(res);
  }

  @Get(':id/url')
  @ApiOperation({ summary: 'Get presigned URL for a file (JSON response)' })
  async getFileUrl(@Param('id', ParseUUIDPipe) id: string, @OrgId() organizationId: string) {
    const url = await this.filesService.getPresignedUrl(id, organizationId);
    return { data: { url } };
  }

  @Get(':id')
  @Redirect()
  @ApiOperation({ summary: 'Get presigned URL for a file (redirect)' })
  async getFile(@Param('id', ParseUUIDPipe) id: string, @OrgId() organizationId: string) {
    const url = await this.filesService.getPresignedUrl(id, organizationId);
    return { url };
  }

  @Get()
  @ApiOperation({ summary: 'List attachments for an issue' })
  async findByIssue(@Query('issueId', ParseUUIDPipe) issueId: string) {
    const attachments = await this.filesService.findByIssue(issueId);
    return { data: attachments };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a file attachment' })
  async delete(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any, @OrgId() organizationId: string) {
    await this.filesService.delete(id, user.id, organizationId);
  }
}

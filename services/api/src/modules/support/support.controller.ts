import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { SupportService } from './support.service';
import { ContactSupportDto } from './dto/contact-support.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OrgId } from '../../common/decorators/org-id.decorator';

@ApiTags('support')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('support')
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Post('contact')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send a support message to the product team' })
  @ApiResponse({ status: 200, description: 'Support request submitted' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async contact(
    @Body() dto: ContactSupportDto,
    @CurrentUser() user: { id: string; email: string; displayName: string },
    @OrgId() organizationId: string,
  ): Promise<{ message: string }> {
    await this.supportService.contactSupport(
      dto,
      user.id,
      user.email,
      user.displayName,
      organizationId,
    );
    return { message: 'Your support request has been submitted. We will get back to you soon.' };
  }
}

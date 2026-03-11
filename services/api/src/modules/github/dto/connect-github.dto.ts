import { IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ConnectGithubDto {
  @ApiProperty()
  @IsString()
  repoOwner: string;

  @ApiProperty()
  @IsString()
  repoName: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  accessToken?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  webhookSecret?: string;
}

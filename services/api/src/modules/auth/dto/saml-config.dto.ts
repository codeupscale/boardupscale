import { IsString, IsUrl, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SamlConfigDto {
  @ApiProperty({ description: 'Identity Provider SSO URL' })
  @IsUrl({}, { message: 'entryPoint must be a valid URL' })
  entryPoint: string;

  @ApiProperty({ description: 'SP Entity ID / Issuer' })
  @IsString()
  issuer: string;

  @ApiProperty({ description: 'IdP X.509 Certificate (PEM format)' })
  @IsString()
  certificate: string;

  @ApiProperty({ required: false, description: 'SP Callback URL (defaults to /api/auth/saml/callback)' })
  @IsUrl({}, { message: 'callbackUrl must be a valid URL' })
  @IsOptional()
  callbackUrl?: string;
}

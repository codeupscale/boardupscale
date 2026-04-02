import { IsString, IsUUID, MaxLength, IsNotEmpty } from 'class-validator';

export class CreateConversationDto {
  @IsUUID()
  projectId: string;
}

export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  content: string;
}

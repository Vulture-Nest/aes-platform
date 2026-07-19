import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@aes.local' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'ChangeMe!123', minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;
}

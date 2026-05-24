import { IsEmail, IsNotEmpty, IsOptional, MinLength, MaxLength } from 'class-validator';
import { UserDto } from '../../user/user.dto';

export class RegisterRequestDto {
  @IsEmail()
  @MaxLength(160)
  email!: string;

  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(255)
  password!: string;

  @IsOptional()
  @MaxLength(80)
  firstName?: string;

  @IsOptional()
  @MaxLength(80)
  lastName?: string;
}

export class LoginRequestDto {
  @IsEmail()
  email!: string;

  @IsNotEmpty()
  password!: string;
}

export class RefreshRequestDto {
  @IsNotEmpty()
  refreshToken!: string;
}

export class AuthResponseDto {
  accessToken!: string;
  refreshToken!: string;
  user!: UserDto;
}

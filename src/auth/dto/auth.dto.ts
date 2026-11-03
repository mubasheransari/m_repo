import { Transform } from 'class-transformer';
import { IsString, Matches, Length } from 'class-validator';

const IDENTIFIER = /^([^\s@]+@[^\s@]+\.[^\s@]+|\+[1-9]\d{7,14})$/;

/** Trims; lower-cases emails; strips spaces, dashes and brackets from phone numbers ("+92 300-1234567" -> "+923001234567"). */
const cleanIdentifier = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const v = value.trim();
  return v.includes('@') ? v.toLowerCase() : v.replace(/[\s\-()]/g, '');
};

export class RequestOtpDto {
  @IsString()
  @Transform(cleanIdentifier)
  @Matches(IDENTIFIER, { message: 'Provide a valid email or phone in international format (e.g. +923001234567)' })
  identifier: string;
}

export class VerifyOtpDto extends RequestOtpDto {
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Length(6, 6, { message: 'The code has 6 digits' })
  @Matches(/^\d{6}$/, { message: 'The code has 6 digits' })
  code: string;
}

export class RefreshDto {
  @IsString()
  refreshToken: string;
}

const cleanEmail = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value);
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class RegisterDto {
  @IsString()
  @Transform(trim)
  @Length(2, 50, { message: 'Name must be 2 to 50 characters' })
  name: string;

  @IsString()
  @Transform(cleanEmail)
  @Matches(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, { message: 'Enter a valid email address' })
  email: string;

  @IsString()
  @Length(8, 72, { message: 'Password must be 8 to 72 characters' })
  @Matches(/[A-Za-z]/, { message: 'Password needs at least one letter' })
  @Matches(/\d/, { message: 'Password needs at least one number' })
  password: string;

  @IsString()
  confirmPassword: string;
}

export class PasswordLoginDto {
  @IsString()
  @Transform(cleanEmail)
  @Matches(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, { message: 'Enter a valid email address' })
  email: string;

  @IsString()
  @Length(1, 72)
  password: string;
}

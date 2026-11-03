import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { PasswordLoginDto, RefreshDto, RegisterDto, RequestOtpDto, VerifyOtpDto } from './dto/auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('otp/request') @HttpCode(200)
  request(@Body() dto: RequestOtpDto) { return this.auth.requestOtp(dto.identifier); }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('otp/verify') @HttpCode(200)
  verify(@Body() dto: VerifyOtpDto) { return this.auth.verifyOtp(dto.identifier, dto.code); }

  // ---- explicit flows: the app tells us whether the member is signing up or logging in ----
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('signup/request') @HttpCode(200)
  signupRequest(@Body() dto: RequestOtpDto) { return this.auth.requestOtp(dto.identifier, 'signup'); }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('signup/verify') @HttpCode(200)
  signupVerify(@Body() dto: VerifyOtpDto) { return this.auth.verifyOtp(dto.identifier, dto.code, 'signup'); }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login/request') @HttpCode(200)
  loginRequest(@Body() dto: RequestOtpDto) { return this.auth.requestOtp(dto.identifier, 'login'); }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login/verify') @HttpCode(200)
  loginVerify(@Body() dto: VerifyOtpDto) { return this.auth.verifyOtp(dto.identifier, dto.code, 'login'); }

  // ---- email + password (used by the app and the admin panel) ----
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register') @HttpCode(200)
  register(@Body() dto: RegisterDto) { return this.auth.register(dto); }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login') @HttpCode(200)
  login(@Body() dto: PasswordLoginDto) { return this.auth.loginPassword(dto); }

  @Post('refresh') @HttpCode(200)
  refresh(@Body() dto: RefreshDto) { return this.auth.refresh(dto.refreshToken); }
}

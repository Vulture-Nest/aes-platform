import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CORRELATION_ID_HEADER } from '../common/middleware/correlation-id.middleware';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { TokenPair } from './token.service';
import { AuthenticatedUser } from './types/authenticated-user';

@ApiTags('auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  private correlationId(req: Request): string | undefined {
    return req.headers[CORRELATION_ID_HEADER] as string | undefined;
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Authenticate with email + password; returns access + refresh tokens' })
  login(@Body() dto: LoginDto, @Req() req: Request): Promise<TokenPair> {
    return this.auth.login(dto.email, dto.password, this.correlationId(req));
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange a valid refresh token for a new token pair (rotates)' })
  refresh(@Body() dto: RefreshDto): Promise<TokenPair> {
    return this.auth.refresh(dto.refreshToken);
  }

  @ApiBearerAuth()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke a refresh token' })
  async logout(
    @Body() dto: RefreshDto,
    @CurrentUser('id') userId: string,
    @Req() req: Request,
  ): Promise<void> {
    await this.auth.logout(dto.refreshToken, userId, this.correlationId(req));
  }

  @ApiBearerAuth()
  @Get('me')
  @ApiOperation({ summary: 'Current authenticated user with site-scoped roles' })
  me(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }
}

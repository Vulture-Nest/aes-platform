import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../rbac/roles.decorator';
import { CreateLookupDto, UpdateLookupDto } from './dto/lookup.dto';
import { LOOKUP_CATEGORIES, LookupService } from './lookup.service';

@ApiTags('settings')
@ApiBearerAuth()
@Controller({ path: 'settings/lookups', version: '1' })
export class SettingsController {
  constructor(private readonly lookups: LookupService) {}

  @Get('categories')
  @ApiOperation({ summary: 'The configurable setting categories' })
  categories() {
    return LOOKUP_CATEGORIES;
  }

  @Get()
  @ApiOperation({ summary: 'List lookup values (any authenticated user; forms use this)' })
  list(@Query('category') category?: string) {
    return this.lookups.list(category);
  }

  @Post()
  @Roles('SYS_ADMIN')
  @ApiOperation({ summary: 'Add a configurable value to a category' })
  create(@Body() dto: CreateLookupDto, @CurrentUser('id') actorId: string) {
    return this.lookups.create(dto, actorId);
  }

  @Patch(':id')
  @Roles('SYS_ADMIN')
  @ApiOperation({ summary: 'Update / enable / disable a value' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLookupDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.lookups.update(id, dto, actorId);
  }

  @Delete(':id')
  @Roles('SYS_ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a non-system value' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') actorId: string) {
    return this.lookups.remove(id, actorId);
  }
}

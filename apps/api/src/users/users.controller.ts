import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../rbac/roles.decorator';
import { CreateUserDto, SiteRoleAssignmentDto } from './dto/create-user.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Roles(Role.SYS_ADMIN)
@Controller({ path: 'users', version: '1' })
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Post()
  @ApiOperation({ summary: 'Provision a user (admin only)' })
  create(@Body() dto: CreateUserDto, @CurrentUser('id') actorId: string) {
    return this.users.create(dto, actorId);
  }

  @Post(':id/roles')
  @ApiOperation({ summary: 'Assign a site-scoped role to a user' })
  assignRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SiteRoleAssignmentDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.users.assignRole(id, dto, actorId);
  }

  @Get()
  @ApiOperation({ summary: 'List users with their site roles' })
  list() {
    return this.users.list();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a user with site roles' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.findOne(id);
  }
}

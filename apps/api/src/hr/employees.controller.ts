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
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { Roles } from '../rbac/roles.decorator';
import { CreateEmployeeDto, ListEmployeesQueryDto, UpdateEmployeeDto } from './dto/employee.dto';
import { EmployeesService } from './employees.service';

/**
 * Employee master (HR-lite, spec §12). PAYROLL PRIVACY: bank account numbers are masked
 * to the last 4 digits in every read response, and each view is audited. Mutations are
 * limited to Finance/SysAdmin; a SITE_MANAGER may read their own site's roster.
 */
@ApiTags('employees')
@ApiBearerAuth()
@Controller({ path: 'employees', version: '1' })
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Get()
  @Roles(
    Role.FINANCE_OFFICER,
    Role.FINANCE_DIRECTOR,
    Role.SYS_ADMIN,
    Role.DIRECTOR,
    Role.SITE_MANAGER,
  )
  @ApiOperation({ summary: 'List employees (account numbers masked; site-scoped for managers)' })
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListEmployeesQueryDto) {
    return this.employees.list(user, query);
  }

  @Get(':id')
  @Roles(
    Role.FINANCE_OFFICER,
    Role.FINANCE_DIRECTOR,
    Role.SYS_ADMIN,
    Role.DIRECTOR,
    Role.SITE_MANAGER,
  )
  @ApiOperation({ summary: 'Get an employee (account number masked)' })
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.employees.findOne(user, id);
  }

  @Post()
  @Roles(Role.FINANCE_OFFICER, Role.FINANCE_DIRECTOR, Role.SYS_ADMIN)
  @ApiOperation({ summary: 'Create an employee' })
  create(@Body() dto: CreateEmployeeDto, @CurrentUser('id') actorId: string) {
    return this.employees.create(dto, actorId);
  }

  @Patch(':id')
  @Roles(Role.FINANCE_OFFICER, Role.FINANCE_DIRECTOR, Role.SYS_ADMIN)
  @ApiOperation({ summary: 'Update an employee' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmployeeDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.employees.update(id, dto, actorId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.FINANCE_OFFICER, Role.FINANCE_DIRECTOR, Role.SYS_ADMIN)
  @ApiOperation({ summary: 'Delete an employee' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') actorId: string) {
    return this.employees.remove(id, actorId);
  }
}

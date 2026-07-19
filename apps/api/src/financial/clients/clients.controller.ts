import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../rbac/roles.decorator';
import { ClientsService } from './clients.service';
import { CreateClientDto, UpdateClientDto } from './dto/client.dto';

@ApiTags('clients')
@ApiBearerAuth()
@Controller({ path: 'clients', version: '1' })
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Get()
  @Roles('FINANCE_OFFICER', 'FINANCE_DIRECTOR', 'SYS_ADMIN', 'AUDITOR')
  @ApiOperation({ summary: 'List clients' })
  list() {
    return this.clients.list();
  }

  @Get(':id')
  @Roles('FINANCE_OFFICER', 'FINANCE_DIRECTOR', 'SYS_ADMIN', 'AUDITOR')
  @ApiOperation({ summary: 'Get a client' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.clients.findOne(id);
  }

  @Post()
  @Roles('FINANCE_OFFICER', 'FINANCE_DIRECTOR', 'SYS_ADMIN')
  @ApiOperation({ summary: 'Create a client' })
  create(@Body() dto: CreateClientDto, @CurrentUser('id') actorId: string) {
    return this.clients.create(dto, actorId);
  }

  @Patch(':id')
  @Roles('FINANCE_OFFICER', 'FINANCE_DIRECTOR', 'SYS_ADMIN')
  @ApiOperation({ summary: 'Update a client' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClientDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.clients.update(id, dto, actorId);
  }
}

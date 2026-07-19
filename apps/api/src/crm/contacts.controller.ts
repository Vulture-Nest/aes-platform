import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../rbac/roles.decorator';
import { ContactsService } from './contacts.service';
import { CreateContactDto, ListContactsQueryDto, UpdateContactDto } from './dto/contact.dto';

@ApiTags('crm-contacts')
@ApiBearerAuth()
@Controller({ path: 'crm/contacts', version: '1' })
export class ContactsController {
  constructor(private readonly contacts: ContactsService) {}

  @Get()
  @Roles('OPS_STAFF', 'OPS_DIRECTOR', 'DIRECTOR', 'SYS_ADMIN', 'FINANCE_DIRECTOR', 'AUDITOR')
  @ApiOperation({ summary: 'List CRM contacts (optionally filter by organisationId)' })
  list(@Query() query: ListContactsQueryDto) {
    return this.contacts.list(query);
  }

  @Get(':id')
  @Roles('OPS_STAFF', 'OPS_DIRECTOR', 'DIRECTOR', 'SYS_ADMIN', 'FINANCE_DIRECTOR', 'AUDITOR')
  @ApiOperation({ summary: 'Get a CRM contact' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.contacts.findOne(id);
  }

  @Post()
  @Roles('OPS_STAFF', 'OPS_DIRECTOR', 'DIRECTOR', 'SYS_ADMIN')
  @ApiOperation({ summary: 'Create a CRM contact' })
  create(@Body() dto: CreateContactDto, @CurrentUser('id') actorId: string) {
    return this.contacts.create(dto, actorId);
  }

  @Patch(':id')
  @Roles('OPS_STAFF', 'OPS_DIRECTOR', 'DIRECTOR', 'SYS_ADMIN')
  @ApiOperation({ summary: 'Update a CRM contact' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContactDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.contacts.update(id, dto, actorId);
  }
}

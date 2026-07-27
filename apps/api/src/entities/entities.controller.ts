import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../rbac/roles.decorator';
import { CreateEntityDto, CreateHolidayDto, UpdateEntityDto } from './dto/entity.dto';
import { EntitiesService } from './entities.service';

@ApiTags('entities')
@ApiBearerAuth()
@Controller({ path: 'entities', version: '1' })
export class EntitiesController {
  constructor(private readonly entities: EntitiesService) {}

  @Get()
  @ApiOperation({ summary: 'List operating entities (any authenticated user)' })
  list() {
    return this.entities.list();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an operating entity (any authenticated user)' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.entities.findOne(id);
  }

  @Get(':id/summary')
  @ApiOperation({ summary: 'Entity plus counts of linked sites/employees/orders' })
  summary(@Param('id', ParseUUIDPipe) id: string) {
    return this.entities.summary(id);
  }

  @Post()
  @Roles('SYS_ADMIN')
  @ApiOperation({ summary: 'Create an operating entity (SYS_ADMIN only)' })
  create(@Body() dto: CreateEntityDto, @CurrentUser('id') actorId: string) {
    return this.entities.create(dto, actorId);
  }

  @Patch(':id')
  @Roles('SYS_ADMIN')
  @ApiOperation({ summary: 'Update an operating entity (SYS_ADMIN only)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEntityDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.entities.update(id, dto, actorId);
  }

  // ---- Public holidays -----------------------------------------------------

  @Get(':id/holidays')
  @ApiOperation({ summary: 'List public holidays for an entity' })
  listHolidays(@Param('id', ParseUUIDPipe) id: string) {
    return this.entities.listHolidays(id);
  }

  @Post(':id/holidays')
  @Roles('SYS_ADMIN')
  @ApiOperation({ summary: 'Add a public holiday to an entity (SYS_ADMIN only)' })
  createHoliday(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateHolidayDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.entities.createHoliday(id, dto.date, dto.name, actorId);
  }

  @Delete(':id/holidays/:holidayId')
  @Roles('SYS_ADMIN')
  @ApiOperation({ summary: 'Remove a public holiday from an entity (SYS_ADMIN only)' })
  deleteHoliday(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('holidayId', ParseUUIDPipe) holidayId: string,
    @CurrentUser('id') actorId: string,
  ) {
    return this.entities.deleteHoliday(id, holidayId, actorId);
  }
}

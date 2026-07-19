import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../rbac/roles.decorator';
import { CreateOrderDto, CreateOrderReceiptDto, UpdateOrderDto } from './dto/order.dto';
import { OrdersService } from './orders.service';

@ApiTags('orders')
@ApiBearerAuth()
@Controller({ path: 'orders', version: '1' })
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @Roles('FINANCE_OFFICER', 'FINANCE_DIRECTOR', 'SYS_ADMIN', 'AUDITOR')
  @ApiOperation({ summary: 'List orders' })
  list() {
    return this.orders.list();
  }

  @Get(':id')
  @Roles('FINANCE_OFFICER', 'FINANCE_DIRECTOR', 'SYS_ADMIN', 'AUDITOR')
  @ApiOperation({ summary: 'Get an order (with receipts and expenses)' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.orders.findOne(id);
  }

  @Post()
  @Roles('FINANCE_OFFICER', 'FINANCE_DIRECTOR', 'SYS_ADMIN')
  @ApiOperation({ summary: 'Create an order' })
  create(@Body() dto: CreateOrderDto, @CurrentUser('id') actorId: string) {
    return this.orders.create(dto, actorId);
  }

  @Patch(':id')
  @Roles('FINANCE_OFFICER', 'FINANCE_DIRECTOR', 'SYS_ADMIN')
  @ApiOperation({ summary: 'Update an order' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrderDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.orders.update(id, dto, actorId);
  }

  @Post(':id/receipts')
  @Roles('FINANCE_OFFICER', 'FINANCE_DIRECTOR', 'SYS_ADMIN')
  @ApiOperation({ summary: 'Record a receipt against an order' })
  recordReceipt(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateOrderReceiptDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.orders.recordReceipt(id, dto, actorId);
  }

  @Post(':id/mark-serviced')
  @HttpCode(HttpStatus.OK)
  @Roles('FINANCE_OFFICER', 'FINANCE_DIRECTOR', 'SYS_ADMIN')
  @ApiOperation({ summary: 'Mark an order as serviced' })
  markServiced(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') actorId: string) {
    return this.orders.markServiced(id, actorId);
  }
}

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
import { AuthenticatedUser } from '../../auth/types/authenticated-user';
import { Roles } from '../../rbac/roles.decorator';
import {
  CreateOrderDto,
  CreateOrderExpenseDto,
  CreateOrderReceiptDto,
  UpdateOrderDto,
} from './dto/order.dto';
import { OrdersService } from './orders.service';

@ApiTags('orders')
@ApiBearerAuth()
@Controller({ path: 'orders', version: '1' })
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @Roles('FINANCE_OFFICER', 'FINANCE_DIRECTOR', 'SYS_ADMIN', 'AUDITOR')
  @ApiOperation({ summary: 'List all orders (managers)' })
  list() {
    return this.orders.list();
  }

  // Any authenticated user; inherently owner-scoped to their own assignments.
  @Get('assigned')
  @ApiOperation({ summary: 'List orders assigned to me' })
  assigned(@CurrentUser('id') userId: string) {
    return this.orders.listAssigned(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an order (managers or the assignee)' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.orders.findOneForActor(id, user);
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

  @Post(':id/expenses')
  @Roles('FINANCE_OFFICER', 'FINANCE_DIRECTOR', 'SYS_ADMIN')
  @ApiOperation({ summary: 'Record an expense against an order' })
  addExpense(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateOrderExpenseDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.orders.addExpense(id, dto, actorId);
  }

  @Post(':id/receipts')
  @ApiOperation({ summary: 'Record a receipt (managers or the assignee)' })
  recordReceipt(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateOrderReceiptDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.orders.recordReceipt(id, dto, user);
  }

  @Post(':id/mark-serviced')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark an order serviced (managers or the assignee)' })
  markServiced(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.orders.markServiced(id, user);
  }
}

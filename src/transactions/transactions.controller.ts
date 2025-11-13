import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { DepositDto } from './dto/deposit.dto';
import { TransferDto } from './dto/transfer.dto';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';

/**
 * Todos os endpoints requerem autenticação (JwtAuthGuard)
 */
@Controller('transactions')
@UseGuards(JwtAuthGuard)
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post('deposit')
  @HttpCode(HttpStatus.CREATED)
  async deposit(
    @CurrentUser() user: AuthenticatedUser,
    @Body() depositDto: DepositDto,
  ) {
    return this.transactionsService.deposit(user.id, depositDto);
  }

  @Post('transfer')
  @HttpCode(HttpStatus.CREATED)
  async transfer(
    @CurrentUser() user: AuthenticatedUser,
    @Body() transferDto: TransferDto,
  ) {
    return this.transactionsService.transfer(user.id, transferDto);
  }

  @Post(':id/reverse')
  @HttpCode(HttpStatus.OK)
  async reverse(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') transactionId: string,
  ) {
    return this.transactionsService.reverseTransaction(user.id, transactionId);
  }

  @Get('history')
  async getHistory(@CurrentUser() user: AuthenticatedUser) {
    return this.transactionsService.getHistory(user.id);
  }

  @Get('balance')
  async getBalance(@CurrentUser() user: AuthenticatedUser) {
    return this.transactionsService.getBalance(user.id);
  }
}

import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const logLevel = process.env.PRISMA_LOG_LEVEL;
    let log: Prisma.LogLevel[] = ['error'];

    if (logLevel) {
      // Se PRISMA_LOG_LEVEL está definido, usa ele
      if (logLevel === 'query') {
        log = ['query', 'info', 'warn', 'error'];
      } else if (logLevel === 'info') {
        log = ['info', 'warn', 'error'];
      } else if (logLevel === 'warn') {
        log = ['warn', 'error'];
      } else if (logLevel === 'error') {
        log = ['error'];
      }
    } else if (process.env.NODE_ENV === 'development') {
      // Fallback: se não tem PRISMA_LOG_LEVEL mas está em dev, log completo
      log = ['query', 'info', 'warn', 'error'];
    }

    super({ log });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Prisma conectado ao banco de dados');
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Prisma desconectado do banco de dados');
  }

  async cleanDatabase() {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Cannot clean database in production!');
    }

    await this.transaction.deleteMany();
    await this.wallet.deleteMany();
    await this.user.deleteMany();
  }
}

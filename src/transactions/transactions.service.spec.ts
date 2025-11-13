import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { TransactionStatus, TransactionType } from '@prisma/client';
import { TransactionsService } from './transactions.service';
import { PrismaService } from '../prisma/prisma.service';

type PrismaMock = {
  $transaction: jest.Mock;
  user: {
    findUnique: jest.Mock;
  };
  wallet: {
    findUnique: jest.Mock;
  };
  transaction: {
    findUnique: jest.Mock;
  };
};

const decimal = (value: number) => ({
  toNumber: () => value,
});

const createService = () => {
  const prisma: PrismaMock = {
    $transaction: jest.fn(),
    user: {
      findUnique: jest.fn(),
    },
    wallet: {
      findUnique: jest.fn(),
    },
    transaction: {
      findUnique: jest.fn(),
    },
  };

  const service = new TransactionsService(prisma as unknown as PrismaService);
  return { service, prisma };
};

describe('TransactionsService', () => {
  afterEach(() => jest.clearAllMocks());

  describe('deposit', () => {
    it('deve realizar depósito compensando saldo negativo', async () => {
      const { service, prisma } = createService();

      const tx = {
        wallet: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'wallet-user',
            balance: decimal(-50),
          }),
          update: jest.fn().mockResolvedValue(undefined),
        },
        transaction: {
          create: jest.fn().mockResolvedValue({
            id: 'tx-dep',
            amount: { toNumber: () => 100 },
            type: TransactionType.DEPOSIT,
            status: TransactionStatus.COMPLETED,
            description: 'Depósito',
            toWalletId: 'wallet-user',
            processedAt: new Date(),
          }),
        },
      };

      prisma.$transaction.mockImplementation((fn) => fn(tx));

      const result = await service.deposit('user-1', {
        amount: 100,
        description: 'Depósito',
      });

      expect(tx.wallet.update).toHaveBeenCalledWith({
        where: { id: 'wallet-user' },
        data: { balance: 50 },
      });
      expect(result.newBalance).toBe(50);
      expect(result.previousBalance).toBe(-50);
    });

    it('deve lançar erro se carteira não encontrada', async () => {
      const { service, prisma } = createService();
      const tx = {
        wallet: {
          findUnique: jest.fn().mockResolvedValue(null),
        },
      };

      prisma.$transaction.mockImplementation((fn) => fn(tx));

      await expect(
        service.deposit('user-1', { amount: 50, description: 'Depósito' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('transfer', () => {
    it('deve transferir valores entre usuários', async () => {
      const { service, prisma } = createService();

      prisma.user.findUnique.mockImplementation(({ where }) => {
        if (where.id === 'user-1') {
          return Promise.resolve({
            id: 'user-1',
            cpf: '12345678900',
          });
        }
        if (where.cpf === '98765432100') {
          return Promise.resolve({
            id: 'user-2',
            name: 'Destinatário',
            cpf: '98765432100',
            wallet: { id: 'wallet-2' },
          });
        }
        return Promise.resolve(null);
      });

      const tx = {
        wallet: {
          findUnique: jest.fn().mockImplementation(({ where }) => {
            if (where.userId === 'user-1') {
              return Promise.resolve({
                id: 'wallet-1',
                balance: decimal(200),
              });
            }
            if (where.userId === 'user-2') {
              return Promise.resolve({
                id: 'wallet-2',
                balance: decimal(120),
              });
            }
            return Promise.resolve(null);
          }),
          update: jest.fn().mockResolvedValue(undefined),
        },
        transaction: {
          create: jest.fn().mockResolvedValue({
            id: 'tx-transfer',
            amount: { toNumber: () => 50 },
            type: TransactionType.TRANSFER,
            status: TransactionStatus.COMPLETED,
            description: 'Transferência',
            fromWalletId: 'wallet-1',
            toWalletId: 'wallet-2',
            processedAt: new Date(),
          }),
        },
      };

      prisma.$transaction.mockImplementation((fn) => fn(tx));

      const result = await service.transfer('user-1', {
        recipientCpf: '987.654.321-00',
        amount: 50,
        description: 'Transferência',
      });

      expect(tx.wallet.update).toHaveBeenCalledWith({
        where: { id: 'wallet-1' },
        data: { balance: 150 },
      });
      expect(tx.wallet.update).toHaveBeenCalledWith({
        where: { id: 'wallet-2' },
        data: { balance: { increment: 50 } },
      });
      expect(result.newBalance).toBe(150);
      expect(result.recipient).toEqual({
        id: 'user-2',
        name: 'Destinatário',
      });
    });

    it('deve validar saldo insuficiente', async () => {
      const { service, prisma } = createService();

      prisma.user.findUnique.mockImplementation(({ where }) => {
        if (where.id === 'user-1') {
          return Promise.resolve({
            id: 'user-1',
            cpf: '12345678900',
          });
        }
        if (where.cpf === '98765432100') {
          return Promise.resolve({
            id: 'user-2',
            name: 'Destinatário',
            cpf: '98765432100',
            wallet: { id: 'wallet-2' },
          });
        }
        return Promise.resolve(null);
      });

      const tx = {
        wallet: {
          findUnique: jest.fn().mockImplementation(({ where }) => {
            if (where.userId === 'user-1') {
              return Promise.resolve({
                id: 'wallet-1',
                balance: decimal(20),
              });
            }
            if (where.userId === 'user-2') {
              return Promise.resolve({
                id: 'wallet-2',
                balance: decimal(100),
              });
            }
            return Promise.resolve(null);
          }),
        },
      };

      prisma.$transaction.mockImplementation((fn) => fn(tx));

      await expect(
        service.transfer('user-1', {
          recipientCpf: '987.654.321-00',
          amount: 50,
          description: 'Transferência',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('deve rejeitar transferência para si mesmo', async () => {
      const { service, prisma } = createService();

      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        cpf: '12345678900',
      });

      await expect(
        service.transfer('user-1', {
          recipientCpf: '123.456.789-00',
          amount: 10,
          description: 'Transferência',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('reverseTransaction', () => {
    it('deve reverter depósito', async () => {
      const { service, prisma } = createService();

      prisma.transaction.findUnique.mockResolvedValue({
        id: 'tx-dep',
        type: TransactionType.DEPOSIT,
        status: TransactionStatus.COMPLETED,
        amount: decimal(100),
        description: 'Depósito',
        toWalletId: 'wallet-1',
        fromWalletId: null,
        toWallet: { user: { id: 'user-1' } },
        fromWallet: null,
      });

      const tx = {
        wallet: {
          update: jest.fn().mockResolvedValue(undefined),
          findUnique: jest.fn().mockResolvedValue({
            id: 'wallet-1',
            balance: decimal(200),
          }),
        },
        transaction: {
          update: jest.fn().mockResolvedValue(undefined),
          create: jest.fn().mockResolvedValue({
            id: 'tx-reversal',
            type: TransactionType.REVERSAL,
            amount: decimal(100),
            status: TransactionStatus.COMPLETED,
            description: 'Estorno: Depósito',
            fromWalletId: 'wallet-1',
            toWalletId: null,
            processedAt: new Date(),
          }),
        },
      };

      prisma.$transaction.mockImplementation((fn) => fn(tx));

      const result = await service.reverseTransaction('user-1', 'tx-dep');

      expect(tx.wallet.update).toHaveBeenCalledWith({
        where: { id: 'wallet-1' },
        data: { balance: { decrement: 100 } },
      });
      expect(result.message).toContain('sucesso');
      expect(result.reversalTransaction.type).toBe('REVERSAL');
      expect(result.newBalance).toBe(200);
    });

    it('deve reverter transferência', async () => {
      const { service, prisma } = createService();

      prisma.transaction.findUnique.mockResolvedValue({
        id: 'tx-transfer',
        type: TransactionType.TRANSFER,
        status: TransactionStatus.COMPLETED,
        amount: decimal(50),
        description: 'Transferência',
        fromWalletId: 'wallet-1',
        toWalletId: 'wallet-2',
        fromWallet: { user: { id: 'user-1' } },
        toWallet: { user: { id: 'user-2' } },
      });

      const tx = {
        wallet: {
          findUnique: jest.fn().mockImplementation(({ where }) => {
            if (where.id === 'wallet-2') {
              return Promise.resolve({
                id: 'wallet-2',
                balance: decimal(80),
              });
            }
            if (where.userId === 'user-1') {
              return Promise.resolve({
                id: 'wallet-1',
                balance: decimal(130),
              });
            }
            return Promise.resolve(null);
          }),
          update: jest.fn().mockResolvedValue(undefined),
        },
        transaction: {
          update: jest.fn().mockResolvedValue(undefined),
          create: jest.fn().mockResolvedValue({
            id: 'tx-reversal',
            type: TransactionType.REVERSAL,
            amount: decimal(50),
            status: TransactionStatus.COMPLETED,
            description: 'Estorno: Transferência',
            fromWalletId: 'wallet-2',
            toWalletId: 'wallet-1',
            processedAt: new Date(),
          }),
        },
      };

      prisma.$transaction.mockImplementation((fn) => fn(tx));

      const result = await service.reverseTransaction('user-1', 'tx-transfer');

      expect(tx.wallet.update).toHaveBeenCalledWith({
        where: { id: 'wallet-1' },
        data: { balance: { increment: 50 } },
      });
      expect(tx.wallet.update).toHaveBeenCalledWith({
        where: { id: 'wallet-2' },
        data: { balance: { decrement: 50 } },
      });
      expect(result.reversalTransaction.type).toBe('REVERSAL');
      expect(result.newBalance).toBe(130);
    });

    it('deve impedir reversão por usuário não autorizado', async () => {
      const { service, prisma } = createService();

      prisma.transaction.findUnique.mockResolvedValue({
        id: 'tx-transfer',
        type: TransactionType.TRANSFER,
        status: TransactionStatus.COMPLETED,
        amount: decimal(50),
        fromWalletId: 'wallet-1',
        toWalletId: 'wallet-2',
        fromWallet: { user: { id: 'user-1' } },
        toWallet: { user: { id: 'user-2' } },
      });

      await expect(
        service.reverseTransaction('user-3', 'tx-transfer'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});

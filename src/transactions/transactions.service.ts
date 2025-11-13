import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionType, TransactionStatus } from '@prisma/client';
import { DepositDto } from './dto/deposit.dto';
import { TransferDto } from './dto/transfer.dto';

/**
 * Segurança e Consistência:
 * - Usa transações de banco de dados (ACID)
 * - Validações de saldo antes de operações
 * - Rollback automático em caso de erro
 */
@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Realiza depósito na carteira do usuário
   *
   * Regra especial: Se saldo < 0, o depósito compensa o negativo
   * Exemplo: saldo = -50, depósito = 100 → saldo final = 50
   *
   * Fluxo:
   * 1. Busca wallet do usuário
   * 2. Inicia transação de BD
   * 3. Atualiza saldo (+ amount)
   * 4. Cria registro de Transaction
   * 5. Commit
   */
  async deposit(userId: string, depositDto: DepositDto) {
    const { amount, description } = depositDto;

    return await this.prisma.$transaction(async (tx) => {
      // Busca wallet do usuário
      const wallet = await tx.wallet.findUnique({
        where: { userId },
      });

      if (!wallet) {
        throw new NotFoundException('Carteira não encontrada');
      }

      const previousBalance = wallet.balance.toNumber();

      // Atualiza saldo (se negativo, o + já compensa)
      const newBalance = previousBalance + amount;

      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: newBalance },
      });

      const transaction = await tx.transaction.create({
        data: {
          type: TransactionType.DEPOSIT,
          amount,
          status: TransactionStatus.COMPLETED,
          description: description || 'Depósito',
          toWalletId: wallet.id,
          processedAt: new Date(),
        },
      });

      this.logger.log(
        `Depósito realizado: User ${userId}, Valor ${amount}, Saldo: ${previousBalance} → ${newBalance}`,
      );

      return {
        ...transaction,
        amount: transaction.amount.toNumber(),
        newBalance,
        previousBalance,
      };
    });
  }

  /**
   * Realiza transferência entre usuários
   *
   * Validações:
   * - Destinatário existe (por CPF)
   * - Remetente tem saldo suficiente
   * - Remetente != Destinatário
   *
   * Fluxo:
   * 1. Limpa CPF (remove formatação)
   * 2. Valida destinatário por CPF
   * 3. Inicia transação de BD
   * 4. Busca ambas carteiras
   * 5. Valida saldo do remetente
   * 6. Debita do remetente
   * 7. Credita ao destinatário
   * 8. Cria registro de Transaction
   * 9. Commit
   */
  async transfer(userId: string, transferDto: TransferDto) {
    const { recipientCpf, amount, description } = transferDto;

    const cleanCpf = recipientCpf.replace(/[^\d]/g, '');

    const fromUser = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!fromUser) {
      throw new NotFoundException('Usuário remetente não encontrado');
    }

    // Valida que não está transferindo para si mesmo
    if (fromUser.cpf === cleanCpf) {
      throw new BadRequestException('Não é possível transferir para si mesmo');
    }

    const toUser = await this.prisma.user.findUnique({
      where: { cpf: cleanCpf },
      include: { wallet: true },
    });

    if (!toUser || !toUser.wallet) {
      throw new NotFoundException('Destinatário não encontrado');
    }

    const toUserId = toUser.id;

    return await this.prisma.$transaction(async (tx) => {
      // Busca carteira do remetente
      const fromWallet = await tx.wallet.findUnique({
        where: { userId },
      });

      if (!fromWallet) {
        throw new NotFoundException('Carteira não encontrada');
      }

      // Busca carteira do destinatário
      const toWallet = await tx.wallet.findUnique({
        where: { userId: toUserId },
      });

      // Valida saldo do remetente
      const currentBalance = fromWallet.balance.toNumber();
      if (currentBalance < amount) {
        throw new BadRequestException(
          `Saldo insuficiente. Disponível: R$ ${currentBalance.toFixed(2)}`,
        );
      }

      const previousBalance = currentBalance;
      const newBalance = currentBalance - amount;

      // Debita do remetente
      await tx.wallet.update({
        where: { id: fromWallet.id },
        data: { balance: newBalance },
      });

      // Credita ao destinatário
      await tx.wallet.update({
        where: { id: toWallet.id },
        data: { balance: { increment: amount } },
      });

      // Cria registro da transação
      const transaction = await tx.transaction.create({
        data: {
          type: TransactionType.TRANSFER,
          amount,
          status: TransactionStatus.COMPLETED,
          description: description || 'Transferência',
          fromWalletId: fromWallet.id,
          toWalletId: toWallet.id,
          processedAt: new Date(),
        },
      });

      this.logger.log(
        `Transferência realizada: ${userId} → ${toUserId} (CPF: ${cleanCpf}), Valor: ${amount}`,
      );

      return {
        ...transaction,
        amount: transaction.amount.toNumber(),
        newBalance,
        previousBalance,
        recipient: {
          id: toUser.id,
          name: toUser.name,
        },
      };
    });
  }

  /**
   * Reverte uma transação (estorno)
   *
   * Validações:
   * - Transação existe
   * - Usuário é dono da transação (remetente ou destinatário)
   * - Transação não foi revertida anteriormente
   * - Apenas DEPOSIT e TRANSFER podem ser revertidos
   */
  async reverseTransaction(userId: string, transactionId: string) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: {
        fromWallet: {
          include: { user: true },
        },
        toWallet: {
          include: { user: true },
        },
      },
    });

    if (!transaction) {
      throw new NotFoundException('Transação não encontrada');
    }

    // Verifica se usuário tem permissão
    const isOwner =
      transaction.toWallet?.user.id === userId ||
      transaction.fromWallet?.user.id === userId;

    if (!isOwner) {
      throw new ForbiddenException(
        'Você não tem permissão para reverter esta transação',
      );
    }

    if (transaction.status === TransactionStatus.REVERSED) {
      throw new BadRequestException('Esta transação já foi revertida');
    }

    if (transaction.type === TransactionType.REVERSAL) {
      throw new BadRequestException('Reversões não podem ser revertidas');
    }

    return await this.prisma.$transaction(async (tx) => {
      const amount = transaction.amount.toNumber();

      // Reverte valores baseado no tipo
      if (transaction.type === TransactionType.DEPOSIT) {
        // Reverte depósito: subtrai valor
        if (!transaction.toWalletId) {
          throw new BadRequestException(
            'Transação de depósito inválida: toWalletId não encontrado',
          );
        }

        await tx.wallet.update({
          where: { id: transaction.toWalletId },
          data: { balance: { decrement: amount } },
        });
      } else if (transaction.type === TransactionType.TRANSFER) {
        if (!transaction.fromWalletId || !transaction.toWalletId) {
          throw new BadRequestException(
            'Transação de transferência inválida: wallet IDs não encontrados',
          );
        }

        // Valida se destinatário tem saldo
        const toWallet = await tx.wallet.findUnique({
          where: { id: transaction.toWalletId },
        });

        if (!toWallet) {
          throw new NotFoundException(
            'Carteira do destinatário não encontrada',
          );
        }

        if (toWallet.balance.toNumber() < amount) {
          throw new BadRequestException(
            'Destinatário não tem saldo suficiente para reversão',
          );
        }

        await tx.wallet.update({
          where: { id: transaction.fromWalletId },
          data: { balance: { increment: amount } },
        });

        await tx.wallet.update({
          where: { id: transaction.toWalletId },
          data: { balance: { decrement: amount } },
        });
      }

      // Marca transação original como REVERSED
      await tx.transaction.update({
        where: { id: transactionId },
        data: { status: TransactionStatus.REVERSED },
      });

      const reversalFromWalletId =
        transaction.type === TransactionType.DEPOSIT
          ? null
          : transaction.toWalletId;
      const reversalToWalletId =
        transaction.type === TransactionType.DEPOSIT
          ? transaction.toWalletId
          : transaction.fromWalletId;

      if (!reversalToWalletId) {
        throw new BadRequestException(
          'Não é possível criar reversão: wallet de destino não encontrado',
        );
      }

      const reversalTransaction = await tx.transaction.create({
        data: {
          type: TransactionType.REVERSAL,
          amount: transaction.amount,
          status: TransactionStatus.COMPLETED,
          description: `Estorno: ${transaction.description}`,
          fromWalletId: reversalFromWalletId,
          toWalletId: reversalToWalletId,
          reversedTransactionId: transaction.id,
          processedAt: new Date(),
        },
      });

      this.logger.log(
        `Transação revertida: ${transactionId} por usuário ${userId}`,
      );

      const updatedWallet = await tx.wallet.findUnique({
        where: { userId },
      });

      if (!updatedWallet) {
        throw new NotFoundException('Carteira não encontrada após reversão');
      }

      return {
        message: 'Transação revertida com sucesso',
        reversalTransaction: {
          ...reversalTransaction,
          amount: reversalTransaction.amount.toNumber(),
        },
        newBalance: updatedWallet.balance.toNumber(),
      };
    });
  }

  async getHistory(userId: string) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
    });

    if (!wallet) {
      throw new NotFoundException('Carteira não encontrada');
    }

    const transactions = await this.prisma.transaction.findMany({
      where: {
        OR: [{ fromWalletId: wallet.id }, { toWalletId: wallet.id }],
      },
      include: {
        fromWallet: {
          include: { user: true },
        },
        toWallet: {
          include: { user: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Formata transações
    return transactions.map((t) => ({
      id: t.id,
      type: t.type,
      amount: t.amount.toNumber(),
      status: t.status,
      description: t.description,
      createdAt: t.createdAt,
      processedAt: t.processedAt,
      direction: t.toWalletId === wallet.id ? 'received' : 'sent',
      otherParty:
        t.type === TransactionType.TRANSFER
          ? {
              id:
                t.toWalletId === wallet.id
                  ? t.fromWallet?.user?.id
                  : t.toWallet?.user?.id,
              name:
                t.toWalletId === wallet.id
                  ? t.fromWallet?.user?.name
                  : t.toWallet?.user?.name,
            }
          : null,
    }));
  }

  async getBalance(userId: string) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
    });

    if (!wallet) {
      throw new NotFoundException('Carteira não encontrada');
    }

    return {
      balance: wallet.balance.toNumber(),
      walletId: wallet.id,
    };
  }
}

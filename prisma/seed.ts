import { config } from 'dotenv';
import * as bcrypt from 'bcrypt';
import { TransactionStatus, TransactionType } from '@prisma/client';
import { TransactionsService } from '../src/transactions/transactions.service';
import { PrismaService } from '../src/prisma/prisma.service';

config();

const prisma = new PrismaService();
const transactionsService = new TransactionsService(prisma);

type SeedUserInput = {
  name: string;
  email: string;
  cpf: string;
  password: string;
};

// Gera CPFs válidos para os usuários
const usersSeed: SeedUserInput[] = [
  {
    name: 'Ana Souza',
    email: 'ana.souza@example.com',
    cpf: generateValidCPF(),
    password: 'SenhaSegura!1',
  },
  {
    name: 'Bruno Lima',
    email: 'bruno.lima@example.com',
    cpf: generateValidCPF(),
    password: 'SenhaSegura!1',
  },
  {
    name: 'Carla Menezes',
    email: 'carla.menezes@example.com',
    cpf: generateValidCPF(),
    password: 'SenhaSegura!1',
  },
];

/**
 * Gera um CPF válido matematicamente
 * Baseado no algoritmo oficial de validação de CPF brasileiro
 */
function generateValidCPF(): string {
  // Gera 9 dígitos aleatórios
  const digits: number[] = [];
  for (let i = 0; i < 9; i++) {
    digits.push(Math.floor(Math.random() * 10));
  }

  // Calcula primeiro dígito verificador
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += digits[i] * (10 - i);
  }
  let digit1 = 11 - (sum % 11);
  if (digit1 >= 10) digit1 = 0;
  digits.push(digit1);

  // Calcula segundo dígito verificador
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += digits[i] * (11 - i);
  }
  let digit2 = 11 - (sum % 11);
  if (digit2 >= 10) digit2 = 0;
  digits.push(digit2);

  // Formata como CPF
  const cpfString = digits.join('');
  return `${cpfString.slice(0, 3)}.${cpfString.slice(3, 6)}.${cpfString.slice(6, 9)}-${cpfString.slice(9, 11)}`;
}

function sanitizeCpf(cpf: string): string {
  return cpf.replace(/[^\d]/g, '');
}

function formatCpf(cpf: string): string {
  const cleaned = sanitizeCpf(cpf);
  return `${cleaned.slice(0, 3)}.${cleaned.slice(3, 6)}.${cleaned.slice(6, 9)}-${cleaned.slice(9, 11)}`;
}

async function cleanDatabase() {
  console.info('Limpando registros existentes...');
  await prisma.transaction.deleteMany();
  await prisma.wallet.deleteMany();
  await prisma.user.deleteMany();
}

async function createUsers() {
  const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS) || 10;

  const createdUsers = [];

  for (const user of usersSeed) {
    const hashedPassword = await bcrypt.hash(user.password, saltRounds);
    const created = await prisma.user.create({
      data: {
        name: user.name,
        email: user.email.toLowerCase(),
        password: hashedPassword,
        cpf: sanitizeCpf(user.cpf),
        wallet: {
          create: {
            balance: 0,
          },
        },
      },
      include: { wallet: true },
    });

    createdUsers.push(created);
  }

  return createdUsers;
}

async function seedTransactions() {
  const users = await createUsers();
  const [ana, bruno, carla] = users;

  // Simula saldo negativo prévio para Carla
  await prisma.wallet.update({
    where: { id: carla.wallet.id },
    data: { balance: -50 },
  });

  // Depósitos iniciais
  const depositoAna = await transactionsService.deposit(ana.id, {
    amount: 1200,
    description: 'Depósito inicial da conta',
  });

  const depositoBruno = await transactionsService.deposit(bruno.id, {
    amount: 400,
    description: 'Reserva inicial para transferências',
  });

  const depositoCarla = await transactionsService.deposit(carla.id, {
    amount: 200,
    description: 'Depósito para compensar saldo negativo',
  });

  // Transferências
  await transactionsService.transfer(ana.id, {
    recipientCpf: formatCpf(bruno.cpf),
    amount: 250,
    description: 'Pagamento de consultoria para Bruno',
  });

  await transactionsService.transfer(bruno.id, {
    recipientCpf: formatCpf(carla.cpf),
    amount: 75,
    description: 'Reembolso de despesas compartilhadas',
  });

  // Transação que será revertida
  const transferenciaReversivel = await transactionsService.transfer(ana.id, {
    recipientCpf: formatCpf(carla.cpf),
    amount: 60,
    description: 'Transferência sujeita a reversão',
  });

  // Depósito que será revertido
  const depositoReversivel = await transactionsService.deposit(bruno.id, {
    amount: 150,
    description: 'Depósito sujeito a reversão',
  });

  // Execução das reversões
  await transactionsService.reverseTransaction(
    ana.id,
    transferenciaReversivel.id,
  );
  await transactionsService.reverseTransaction(bruno.id, depositoReversivel.id);

  console.info('📈 Resumo das movimentações criadas:');
  console.table([
    {
      usuario: ana.name,
      email: ana.email,
      saldo: depositoAna.newBalance,
    },
    {
      usuario: bruno.name,
      email: bruno.email,
      saldo: depositoBruno.newBalance,
    },
    {
      usuario: carla.name,
      email: carla.email,
      saldo: depositoCarla.newBalance,
    },
  ]);

  // Estatísticas rápidas
  const totalTransacoes = await prisma.transaction.count();
  const reversoes = await prisma.transaction.count({
    where: {
      type: TransactionType.REVERSAL,
      status: TransactionStatus.COMPLETED,
    },
  });

  console.info(
    `✅ Seed concluído com sucesso (${users.length} usuários, ${totalTransacoes} transações, ${reversoes} reversões).`,
  );
  console.info('Usuários criados para login:');
  usersSeed.forEach((user, index) => {
    console.info(`\n    ${users[index].name}:`);
    console.info(`    Email: ${user.email}`);
    console.info(`    CPF: ${formatCpf(user.cpf)}`);
    console.info(`    Senha: ${user.password}`);
  });
}

async function main() {
  await prisma.$connect();
  await cleanDatabase();
  await seedTransactions();
}

main()
  .catch((error) => {
    console.error('Erro ao executar seed do banco:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

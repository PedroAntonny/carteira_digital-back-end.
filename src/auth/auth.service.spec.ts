import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
  compare: jest.fn().mockImplementation((plain: string, hashed: string) => {
    // Simula comparação: se plain + '-hashed' === hashed, retorna true
    return Promise.resolve(`${plain}-hashed` === hashed);
  }),
}));

type PrismaMock = {
  user: {
    findFirst: jest.Mock;
    create: jest.Mock;
    findUnique: jest.Mock;
  };
};

describe('AuthService', () => {
  let service: AuthService;
  let prisma: PrismaMock;
  let jwtService: JwtService;

  const decimal = (value: number) => ({
    toNumber: () => value,
  });

  const makeUser = () => ({
    id: 'user-1',
    name: 'Test User',
    email: 'test@example.com',
    password: 'password-hashed',
    cpf: '12345678900',
    wallet: { id: 'wallet-1', balance: decimal(0) },
  });

  beforeEach(() => {
    prisma = {
      user: {
        findFirst: jest.fn(),
        create: jest.fn(),
        findUnique: jest.fn(),
      },
    };

    jwtService = {
      sign: jest.fn().mockReturnValue('signed-token'),
      verify: jest.fn(),
    } as unknown as JwtService;

    service = new AuthService(prisma as unknown as PrismaService, jwtService);

    jest.clearAllMocks();
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');
    (bcrypt.compare as jest.Mock).mockImplementation(
      (plain: string, hashed: string) => {
        return Promise.resolve(`${plain}-hashed` === hashed);
      },
    );
  });

  describe('register', () => {
    it('deve registrar usuário e criar wallet', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        ...makeUser(),
        password: 'hashed-password',
      });

      const result = await service.register({
        name: 'Test User',
        email: 'test@example.com',
        password: 'password',
        cpf: '123.456.789-00',
      });

      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: {
          OR: [{ email: 'test@example.com' }, { cpf: '12345678900' }],
        },
      });

      expect(bcrypt.hash).toHaveBeenCalledWith('password', expect.any(Number));

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: 'test@example.com',
          password: 'hashed-password',
          cpf: '12345678900',
          wallet: { create: { balance: 0 } },
        }),
        include: { wallet: true },
      });

      expect(result).toMatchObject({
        id: 'user-1',
        email: 'test@example.com',
        wallet: { id: 'wallet-1', balance: 0 },
      });
      expect(result.wallet?.balance).toBe(0);
      expect('password' in result).toBe(false);
    });

    it('deve rejeitar email duplicado', async () => {
      prisma.user.findFirst.mockResolvedValue({
        email: 'test@example.com',
        cpf: '12345678900',
      });

      await expect(
        service.register({
          name: 'Test',
          email: 'test@example.com',
          password: 'password',
          cpf: '12345678900',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('login', () => {
    it('deve autenticar usuário válido', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...makeUser(),
        password: 'password-hashed',
      });

      const result = await service.login({
        email: 'test@example.com',
        password: 'password',
      });

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
        include: { wallet: true },
      });
      expect(bcrypt.compare).toHaveBeenCalledWith(
        'password',
        'password-hashed',
      );
      expect(jwtService.sign).toHaveBeenCalledWith({
        email: 'test@example.com',
        sub: 'user-1',
      });
      expect(result).toEqual({
        access_token: 'signed-token',
        user: expect.objectContaining({
          id: 'user-1',
          email: 'test@example.com',
        }),
      });
    });

    it('deve rejeitar senha inválida', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...makeUser(),
        password: 'password-hashed',
      });

      await expect(
        service.login({
          email: 'test@example.com',
          password: 'wrong',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('deve rejeitar usuário inexistente', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({
          email: 'unknown@example.com',
          password: 'password',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});

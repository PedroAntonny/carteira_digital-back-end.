import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from './types/jwt-payload.interface';

/**
 * Responsabilidades (SRP):
 * - Registro de usuários com hash de senha
 * - Login com validação de credenciais
 * - Geração de JWT
 * - Criação automática de wallet
 *
 * Segurança:
 * - bcrypt com salt rounds = 10
 * - Validação de unicidade de email/CPF
 * - Nunca expõe senha em responses
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS) || 10;

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  /**
   * Registra novo usuário no sistema
   *
   * Fluxo:
   * 1. Valida unicidade de email e CPF
   * 2. Hash da senha com bcrypt
   * 3. Cria usuário e wallet em uma transação
   * 4. Retorna usuário (senha excluída)
   */
  async register(registerDto: RegisterDto) {
    const { name, email, password, cpf } = registerDto;

    const cleanCpf = cpf.replace(/[^\d]/g, '');

    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [{ email }, { cpf: cleanCpf }],
      },
    });

    if (existingUser) {
      if (existingUser.email === email) {
        throw new ConflictException('Email já cadastrado');
      }
      if (existingUser.cpf === cleanCpf) {
        throw new ConflictException('CPF já cadastrado');
      }
    }

    const hashedPassword = await bcrypt.hash(password, this.SALT_ROUNDS);

    // Cria usuário e wallet em uma transação
    const user = await this.prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        cpf: cleanCpf,
        wallet: {
          create: {
            balance: 0,
          },
        },
      },
      include: {
        wallet: true,
      },
    });

    this.logger.log(`Novo usuário registrado: ${email}`);

    const { password: _, ...userWithoutPassword } = user;

    // Converte Decimal para number para serialização JSON correta
    return {
      ...userWithoutPassword,
      wallet: userWithoutPassword.wallet
        ? {
            ...userWithoutPassword.wallet,
            balance: userWithoutPassword.wallet.balance.toNumber(),
          }
        : null,
    };
  }

  /**
   * Autentica usuário e retorna JWT
   *
   * Fluxo:
   * 1. Busca usuário por email
   * 2. Compara senha com hash
   * 3. Gera JWT com id do usuário
   * 4. Retorna token e dados do usuário
   */
  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    // Busca usuário com wallet
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { wallet: true },
    });

    if (!user) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    // Gera JWT
    const payload = { email: user.email, sub: user.id };
    const access_token = this.jwtService.sign(payload);

    this.logger.log(`Usuário autenticado: ${email}`);

    const { password: _, ...userWithoutPassword } = user;

    // Converte Decimal para number para serialização JSON correta
    return {
      access_token,
      user: {
        ...userWithoutPassword,
        wallet: userWithoutPassword.wallet
          ? {
              ...userWithoutPassword.wallet,
              balance: userWithoutPassword.wallet.balance.toNumber(),
            }
          : null,
      },
    };
  }

  async validateToken(token: string): Promise<JwtPayload> {
    try {
      return this.jwtService.verify<JwtPayload>(token);
    } catch (error) {
      throw new UnauthorizedException('Token inválido');
    }
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: { wallet: true },
    });
  }
}

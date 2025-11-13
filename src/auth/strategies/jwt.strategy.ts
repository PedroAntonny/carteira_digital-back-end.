import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../types/authenticated-user.type';
import { JwtPayload } from '../types/jwt-payload.interface';

/**
 * JWT Strategy para Passport com Prisma
 *
 * Implementa Strategy Pattern para autenticação JWT
 * - Extrai token do header Authorization
 * - Valida assinatura com secret
 * - Carrega usuário do banco via Prisma
 * - Disponibiliza user no request
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET!,
      issuer: process.env.JWT_ISSUER,
      audience: process.env.JWT_AUDIENCE,
    });
  }

  /**
   * Método chamado automaticamente após validação do token
   * Payload contém os dados que foram encodados no JWT
   *
   * IMPORTANTE: Este método é chamado a cada requisição e busca dados FRESCOS do banco
   */
  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { wallet: true },
    });

    if (!user) {
      throw new UnauthorizedException('Usuário não encontrado');
    }

    // Remove senha antes de retornar
    const { password: _password, ...userWithoutPassword } = user;

    return userWithoutPassword;
  }
}

import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Guard JWT para proteção de rotas
 *
 * Uso: @UseGuards(JwtAuthGuard) em controllers
 * Valida automaticamente o token JWT e injeta user no request
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }
}

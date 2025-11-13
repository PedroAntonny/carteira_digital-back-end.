import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Decorator customizado para obter usuário autenticado
 *
 * Uso: @CurrentUser() user em métodos de controller
 * Extrai o user do request (injetado pelo JwtStrategy)
 *
 * Nota: Com Prisma, o tipo é inferido automaticamente
 */
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);

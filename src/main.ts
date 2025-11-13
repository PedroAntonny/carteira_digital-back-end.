import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';

/**
 * Configurações:
 * - CORS habilitado para frontend
 * - Validation Pipe global para DTOs
 * - Transform para conversão automática de tipos
 * - WhiteList para remover propriedades não esperadas
 */
async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule);

  const frontendUrl = process.env.FRONTEND_URL;
  if (!frontendUrl) {
    logger.warn(
      'Variável FRONTEND_URL não configurada. Habilitando CORS amplo.',
    );
  }

  app.enableCors({
    origin: frontendUrl ?? true,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  app.setGlobalPrefix('api');

  const port = Number(process.env.PORT);
  if (!port) {
    throw new Error('Variável PORT não configurada. Defina no arquivo .env');
  }

  await app.listen(port);

  logger.log(`Aplicação rodando na porta ${port}`);
  logger.log(`Ambiente: ${process.env.NODE_ENV || 'development'}`);
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    try {
      const parsedUrl = new URL(databaseUrl.replace('postgresql', 'http'));
      logger.log(
        `Banco de dados: ${parsedUrl.hostname}:${parsedUrl.port}${parsedUrl.pathname}`,
      );
    } catch (error) {
      logger.warn('Não foi possível interpretar DATABASE_URL.');
    }
  } else {
    logger.warn('Variável DATABASE_URL não configurada.');
  }
}

bootstrap();

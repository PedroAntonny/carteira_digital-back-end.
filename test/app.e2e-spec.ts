import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Testa fluxos completos da aplicação:
 * 1. Registro de usuário
 * 2. Login
 * 3. Depósito
 * 4. Transferência entre usuários
 * 5. Consulta de saldo e histórico
 * 6. Reversão de transação
 */
describe('AppController (e2e)', () => {
  let app: INestApplication;
  let authToken: string;
  let _userId: string;
  let _secondAuthToken: string;
  let transactionId: string;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = moduleFixture.get(PrismaService);

    app.setGlobalPrefix('api');

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();
    await prisma.cleanDatabase();
  });

  afterAll(async () => {
    await prisma.cleanDatabase();
    await prisma.$disconnect();
    await app.close();
  });

  describe('Fluxo completo de autenticação', () => {
    it('POST /api/auth/register - deve registrar usuário', () => {
      return request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          name: 'Test User',
          email: 'test@test.com',
          password: 'password123',
          cpf: '52998224725',
        })
        .expect(201)
        .then((response) => {
          expect(response.body).toHaveProperty('id');
          expect(response.body).toHaveProperty('wallet');
          expect(Number(response.body.wallet.balance)).toBe(0);
          expect(response.body).not.toHaveProperty('password');
          _userId = response.body.id;
        });
    });

    it('POST /api/auth/register - deve rejeitar email duplicado', () => {
      return request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          name: 'Test User 2',
          email: 'test@test.com',
          password: 'password123',
          cpf: '39053344705',
        })
        .expect(409);
    });

    it('POST /api/auth/login - deve fazer login', () => {
      return request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: 'test@test.com',
          password: 'password123',
        })
        .expect(200)
        .then((response) => {
          expect(response.body).toHaveProperty('access_token');
          expect(response.body).toHaveProperty('user');
          authToken = response.body.access_token;
        });
    });

    it('POST /api/auth/login - deve rejeitar credenciais inválidas', () => {
      return request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: 'test@test.com',
          password: 'wrongpassword',
        })
        .expect(401);
    });

    it('GET /api/auth/profile - deve retornar perfil autenticado', () => {
      return request(app.getHttpServer())
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)
        .then((response) => {
          expect(response.body.email).toBe('test@test.com');
        });
    });
  });

  describe('Fluxo de transações', () => {
    it('POST /api/transactions/deposit - deve realizar depósito', () => {
      return request(app.getHttpServer())
        .post('/api/transactions/deposit')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          amount: 100.5,
          description: 'Depósito inicial',
        })
        .expect(201)
        .then((response) => {
          expect(response.body.type).toBe('DEPOSIT');
          expect(response.body.amount).toBe(100.5);
          expect(response.body.newBalance).toBe(100.5);
          transactionId = response.body.id;
        });
    });

    it('GET /api/transactions/balance - deve retornar saldo atualizado', () => {
      return request(app.getHttpServer())
        .get('/api/transactions/balance')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)
        .then((response) => {
          expect(Number(response.body.balance)).toBe(100.5);
        });
    });

    it('GET /api/transactions/history - deve retornar histórico', () => {
      return request(app.getHttpServer())
        .get('/api/transactions/history')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)
        .then((response) => {
          expect(Array.isArray(response.body)).toBe(true);
          expect(response.body.length).toBeGreaterThan(0);
        });
    });

    // Cria segundo usuário para testar transferência
    it('Deve criar segundo usuário para transferência', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          name: 'Second User',
          email: 'second@test.com',
          password: 'password123',
          cpf: '15350946056',
        })
        .expect(201);

      const loginResponse = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: 'second@test.com',
          password: 'password123',
        })
        .expect(200);

      _secondAuthToken = loginResponse.body.access_token;
    });

    it('POST /api/transactions/transfer - deve realizar transferência', () => {
      return request(app.getHttpServer())
        .post('/api/transactions/transfer')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          recipientCpf: '153.509.460-56',
          amount: 50.0,
          description: 'Transferência teste',
        })
        .expect(201)
        .then((response) => {
          expect(response.body.type).toBe('TRANSFER');
          expect(response.body.amount).toBe(50.0);
          expect(Number(response.body.newBalance)).toBe(50.5);
        });
    });

    it('POST /api/transactions/transfer - deve rejeitar saldo insuficiente', () => {
      return request(app.getHttpServer())
        .post('/api/transactions/transfer')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          recipientCpf: '153.509.460-56',
          amount: 1000.0,
          description: 'Transferência impossível',
        })
        .expect(400);
    });

    it('POST /api/transactions/:id/reverse - deve reverter transação', () => {
      return request(app.getHttpServer())
        .post(`/api/transactions/${transactionId}/reverse`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)
        .then((response) => {
          expect(response.body.message).toContain('sucesso');
          expect(response.body.reversalTransaction).toBeDefined();
        });
    });
  });

  describe('Validações e segurança', () => {
    it('Deve rejeitar requisições sem autenticação', () => {
      return request(app.getHttpServer())
        .get('/api/transactions/balance')
        .expect(401);
    });

    it('Deve validar DTOs - depósito com valor negativo', () => {
      return request(app.getHttpServer())
        .post('/api/transactions/deposit')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          amount: -10,
          description: 'Depósito inválido',
        })
        .expect(400);
    });

    it('Deve validar DTOs - email inválido no registro', () => {
      return request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          name: 'Test',
          email: 'invalid-email',
          password: 'password123',
          cpf: '29537977083',
        })
        .expect(400);
    });
  });
});

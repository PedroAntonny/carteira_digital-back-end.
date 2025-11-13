# 🔧 Backend - Carteira Digital

API REST desenvolvida com Nest.js, Prisma e PostgreSQL.

## 🛠️ Stack Tecnológica

- **Nest.js 10**: Framework Node.js com TypeScript
- **Prisma ORM**: ORM type-safe para PostgreSQL
- **PostgreSQL**: Banco de dados relacional
- **JWT**: Autenticação stateless
- **bcrypt**: Hash de senhas
- **class-validator**: Validação de DTOs
- **Passport**: Estratégias de autenticação

## 🏗️ Arquitetura

### Estrutura em Camadas

```
Controllers → Services → Prisma Service → Database
```

### Módulos

- **AuthModule**: Autenticação e autorização
- **TransactionsModule**: Operações financeiras
- **PrismaModule**: Acesso ao banco de dados

### Design Patterns

- **Repository Pattern**: PrismaService encapsula acesso ao banco
- **Strategy Pattern**: JWT Strategy do Passport
- **Dependency Injection**: Nest.js DI container
- **DTO Pattern**: Validação de dados de entrada
- **Guard Pattern**: Proteção de rotas

### Princípios SOLID

- **S**ingle Responsibility: Cada service tem uma responsabilidade
- **O**pen/Closed: Extensível via interfaces
- **L**iskov Substitution: Interfaces bem definidas
- **I**nterface Segregation: Interfaces específicas
- **D**ependency Inversion: Dependências injetadas

## 📊 Modelagem de Dados

### Schema Prisma

```prisma
User (1) ─── (1) Wallet
              │
              ├── (N) Transactions (to)
              └── (N) Transactions (from)
```

### Entidades

- **User**: Usuários do sistema
- **Wallet**: Carteira financeira (1:1 com User)
- **Transaction**: Transações financeiras (DEPOSIT, TRANSFER, REVERSAL)

### Decisões

- **UUID** como Primary Key (segurança)
- **Decimal** para valores monetários (precisão)
- **Enums** para tipos e status (type-safety)
- **Timestamps** automáticos (auditoria)

## 🔒 Segurança

- Senhas hasheadas com bcrypt (salt rounds = 10)
- JWT com secret configurável
- Validação de DTOs em todas as entradas
- Guards protegendo rotas sensíveis
- Transações ACID para consistência
- Validação de CPF

## 🧪 Testes

### Unitários

```bash
npm test
```

Cobertura:

- AuthService (registro, login)
- TransactionsService (depósito, transferência, reversão)

### Integração (E2E)

```bash
npm run test:e2e
```

Testa fluxo completo:

- Registro → Login → Depósito → Transferência → Reversão

## 📝 Observabilidade

- Logger do Nest.js em todos os services
- Logging interceptor global
- Exception filter com logs estruturados
- Logs de transações importantes

## 🐳 Banco de Dados (Docker)

Este projeto utiliza Docker Compose para gerenciar o banco de dados PostgreSQL.

```bash
# Subir PostgreSQL
docker compose up -d database

# Ver logs
docker compose logs -f database

# Parar
docker compose down

# Parar e remover volumes (CUIDADO: apaga dados)
docker compose down -v
```

O banco de dados estará disponível em:

- **Host**: `localhost`
- **Porta**: `5435`
- **Database**: `carteira_digital`
- **User**: `postgres`
- **Password**: `postgres`

## 🚀 Comandos

```bash
# Desenvolvimento
npm run start:dev

# Build
npm run build

# Produção
npm run start:prod

# Testes
npm test
npm run test:e2e

# Prisma
npx prisma generate
npx prisma migrate dev
npx prisma studio
npm run prisma:seed
```

## 📚 Estrutura de Arquivos

```
backend/
├── docker-compose.yml         # Configuração Docker para PostgreSQL
├── prisma/
│   ├── schema.prisma          # Schema do banco
│   ├── migrations/            # Migrations SQL
│   └── seed.ts                # Seed de dados
├── src/
│   ├── auth/                  # Módulo de autenticação
│   ├── transactions/          # Módulo de transações
│   ├── prisma/                # PrismaService
│   ├── common/                # Filtros, interceptors, validators
│   ├── app.module.ts          # Módulo raiz
│   └── main.ts                # Bootstrap
└── test/
    └── app.e2e-spec.ts        # Testes E2E
```

## 🔗 Frontend

Este backend foi desenvolvido para trabalhar em conjunto com o frontend Next.js.

O frontend deve estar configurado para apontar para:

- **URL da API**: `http://localhost:3001/api`
- **Variável de ambiente**: `NEXT_PUBLIC_API_URL`

## 🔗 Endpoints

### Autenticação

- `POST /api/auth/register` - Cadastro
- `POST /api/auth/login` - Login
- `GET /api/auth/profile` - Perfil (autenticado)

### Transações (Autenticadas)

- `POST /api/transactions/deposit` - Depósito
- `POST /api/transactions/transfer` - Transferência
- `POST /api/transactions/:id/reverse` - Reversão
- `GET /api/transactions/history` - Histórico
- `GET /api/transactions/balance` - Saldo

## 🚀 Como Executar

### Pré-requisitos

- Docker e Docker Compose
- Node.js 18+
- npm

### 1. Configurar Variáveis de Ambiente

```bash
cp env.example .env
# Edite .env - IMPORTANTE: Configure JWT_SECRET forte!
```

**Variáveis obrigatórias:**

- `DATABASE_URL` - URL de conexão PostgreSQL (padrão: `postgresql://postgres:postgres@localhost:5435/carteira_digital?schema=public`)
- `JWT_SECRET` - Secret para assinatura JWT (use um valor forte!)
- `PORT` - Porta da aplicação (padrão: 3001)

### 2. Subir Banco de Dados

```bash
docker compose up -d database
```

### 3. Instalar Dependências e Configurar

```bash
# Instalar dependências
npm install

# Gerar Prisma Client
npx prisma generate

# Executar migrations
npx prisma migrate dev

# Popular banco com dados de teste (opcional)
npm run prisma:seed
```

### 4. Iniciar Aplicação

```bash
npm run start:dev
```

A API estará disponível em: **http://localhost:3001/api**

## 🔧 Variáveis de Ambiente

Veja `env.example` para todas as variáveis necessárias.

**Obrigatórias:**

- `DATABASE_URL` - URL de conexão PostgreSQL
- `JWT_SECRET` - Secret para assinatura JWT
- `PORT` - Porta da aplicação (padrão: 3001)

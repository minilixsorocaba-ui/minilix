# MiniLix — Plataforma de Coleta de Resíduos

Base inicial da plataforma operacional da MiniLix, preparada para execução no Railway com PostgreSQL.

## Módulos da primeira base

- Login e autenticação por e-mail e senha
- Perfis: ADMIN, ATENDIMENTO e MOTORISTA
- Dashboard operacional
- Cadastro de clientes
- Nova Locação
- Cadastro de endereço
- Seleção de tambores/recipientes
- Geração automática de Ordem de Serviço (OS)
- Lista de Ordens de Serviço
- Tela operacional do motorista
- PostgreSQL

## Arquitetura

```text
Navegador
   |
   v
React + Vite
   |
   | /api
   v
Node.js + Express
   |
   v
PostgreSQL (Railway)
```

Em produção, o Express serve também o frontend compilado, permitindo operar a aplicação como um único serviço web no Railway.

## Segurança

- Senhas armazenadas somente como hash bcrypt.
- Sessão em cookie HttpOnly; o frontend não acessa o token JWT diretamente.
- JWT assinado com `JWT_SECRET` armazenado nas variáveis de ambiente do Railway.
- `DATABASE_URL` também fica somente nas variáveis de ambiente.
- Nenhuma senha ou segredo deve ser colocado no código ou no GitHub.

## Variáveis de ambiente

Copie `server/.env.example` para `server/.env` em desenvolvimento.

No Railway, configure pelo menos:

- `DATABASE_URL`
- `JWT_SECRET`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `NODE_ENV=production`

O primeiro usuário administrador é criado automaticamente somente quando o banco ainda não possui usuários.

## Desenvolvimento local

Requer Node.js 20+ e PostgreSQL.

```bash
npm install
npm run dev
```

Frontend: `http://localhost:5173`

API: `http://localhost:3000`

## Produção / Railway

```bash
npm install
npm run build
npm start
```

O serviço usa a variável `PORT` fornecida pelo Railway.

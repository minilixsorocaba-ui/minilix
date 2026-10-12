# MiniLiX — Programa Condomínio Parceiro

Extensão do repositório oficial `minilixsorocaba-ui/minilix`, baseada no commit `5ee7fa0d7e5bb404015493f4e723fb0cdc7b5a3c`.

## Telas

- `/parceiros`: acesso de síndicos e administradoras, com login próprio e autorização por condomínio.
- `/parceiros/admin`: acesso exclusivo ao perfil ADMIN da MiniLiX. Usa a sessão já existente do sistema.
- `/cliente`: contratação pelo morador com os campos código do condomínio e unidade. Aceita pré-preenchimento com `?condominio=MLX-C-...`.
- Nova Locação do sistema operacional também recebe código e unidade.

## Implantação

1. Fazer backup do PostgreSQL e validar esta versão em homologação antes de substituir o serviço principal.
2. Manter DATABASE_URL, JWT_SECRET e demais variáveis do sistema. Opcional: APP_ORIGIN com a origem HTTPS exata do aplicativo.
3. `npm ci`, `npm run test:partners`, `npm run build`.
4. Publicar esta versão no serviço `minilix-web`, pela raiz do projeto e Dockerfile existente. Não utilizar o serviço antigo `minilix-app` configurado para a pasta server.
5. O servidor aplica `partners.sql` no início, depois do schema existente. As tabelas e colunas novas são aditivas; contratos e vínculos anteriores não são criados automaticamente.
6. Entrar na MiniLiX com ADMIN e acessar `/parceiros/admin`. Registrar contratação formalizada, início do piloto, CNPJ e conta de titularidade do condomínio.
7. O código único é gerado no registro da contratação. Autorizar os usuários por e-mail. Para uma administradora acompanhar outro condomínio, conceder outro vínculo ao mesmo e-mail.
8. Entregar credenciais iniciais por canal reservado. O parceiro altera sua senha pelo portal.

Esta versão foi construída e testada localmente para publicação no serviço minilix-web. Não há dados demonstrativos ou senhas padrão adicionados à produção. O estado final da publicação deve ser conferido pelo deployment da Railway e pelo endpoint /api/health.

## Financeiro

- Taxa fixa de 3%, piloto de 90 dias corridos, código e condições imutáveis.
- O pacote inicial usa a regra atual de R$ 110 por tambor no sistema. Dias adicionais não integram a base; receitas avulsas ou tambores solicitados depois têm base elegível zero.
- Geração somente após conclusão da locação e quitação de todas as receitas não canceladas da locação.
- Gatilhos PostgreSQL reconciliam status financeiro e conclusão operacional. A confirmação Pix já existente também passa por financial_entries e pelo mesmo cálculo.
- Livro de cashback preserva créditos e ajustes; não apaga histórico. Repetições não geram outro crédito.
- Estorno posterior a um repasse produz movimento negativo para compensação. Caso a parceria termine com dívida de ajuste, a regularização é feita pelo financeiro com o condomínio.
- Repasse registra transferência já realizada, referência única, comprovante ou referência de arquivo, data e conta do condomínio. Não transfere dinheiro automaticamente.
- O repasse liquida o saldo positivo de meses encerrados, descontando ajustes negativos existentes, e gera uma DESPESA PAGA no financeiro da MiniLiX na mesma transação.
- Não há emissão automática de nota fiscal, integração bancária de saída ou envio automático de relatório; relatórios podem ser exportados em CSV. Apuração usa o fuso America/Sao_Paulo.

## Acesso e auditoria

Cookies HttpOnly; sessão do parceiro com audiência própria, separada de clientes e equipe. Login com limitação de tentativas; validação de origem nas mutações novas; verificação de usuário ativo e vínculo no servidor. A administradora só enxerga condomínios explicitamente autorizados. Código de indicação não é senha. A troca de senha invalida sessões anteriores e a revogação do vínculo bloqueia acesso imediatamente.

Parceiros consultam OS, unidade, datas, valores e status, sem acesso a CPF, telefone, dados bancários, senhas ou ao financeiro de outros condomínios. ADMIN acompanha todos os contratos e audita contratação, concessão/revogação e repasse. A autenticação da equipe agora revalida usuário ativo e perfil atual no banco.

## Validação realizada

Build de produção Vite, verificação sintática de backend e testes com PostgreSQL embutido (PGlite): geração, ausência de extras, idempotência, estorno/recomposição, imutabilidade, migração repetida, login, isolamento entre condomínios, acesso a vários vínculos, revogação, troca de senha, origem indevida, repasse e geração de despesa, saldo desatualizado e tentativa de repasse duplicado.

Não houve teste visual em navegador nem teste no banco/servidor de produção. A edição corrige uma aspa solta no CSS da marca que impedia o processamento dos estilos do novo módulo.

## Complementos desta versão

Relatório mensal por competência, com saldo inicial, créditos, ajustes, repasses registrados e saldo final; impressão ou salvamento em PDF pelo navegador. Consulta consistente em transação de leitura. Atualização auditada de conta bancária; redefinição de senha do parceiro com invalidação das sessões; visão consolidada dos condomínios. Repasse, auditoria e despesa correspondente não podem ser alterados/excluídos. A competência dos repasses considera a data de registro contábil, exibindo separadamente a data da transferência. Logo otimizada em WebP.

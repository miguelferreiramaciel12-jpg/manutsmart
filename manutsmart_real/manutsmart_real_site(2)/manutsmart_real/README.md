# ManutSmart — sistema real de serviços

Este pacote contém uma versão real executável do sistema, fora do protótipo visual.

Fluxo principal:

1. **Funcionário** cria uma solicitação de serviço.
2. A solicitação fica no **armazenamento do líder**.
3. O **líder** encaminha para um técnico cadastrado.
4. O **técnico** recebe a tarefa e atualiza o status.

## Funções disponíveis

- Funcionário
- Líder
- Técnico

A função não é escolhida no login. Ela é definida somente no cadastro.

## Categorias de serviço

- Elétrica
- Hidráulica
- Alvenaria
- Jardinagem

## Validação de email real

O sistema exige confirmação por código enviado ao email cadastrado.

Isso é a forma correta de obrigar um email real, porque apenas validar o formato do email não prova que ele existe ou que o usuário tem acesso.

Em ambiente real, configure SMTP no arquivo `.env`.

Se o SMTP não estiver configurado, o sistema roda em modo desenvolvimento e mostra o código no terminal para teste local.

## Como rodar no computador

1. Instale o Node.js 18 ou superior.
2. Abra a pasta do projeto no terminal.
3. Instale as dependências:

```bash
npm install
```

4. Copie o arquivo `.env.example` para `.env`:

```bash
cp .env.example .env
```

No Windows, você pode copiar manualmente o arquivo e renomear para `.env`.

5. Rode o sistema:

```bash
npm start
```

6. Abra no navegador:

```text
http://localhost:3000
```

## Para publicar de verdade

Para colocar em um domínio real, você ainda precisa:

- Hospedagem Node.js, como Render, Railway, VPS, Hostinger VPS ou similar.
- Domínio próprio.
- SMTP configurado, como Gmail com senha de app, Brevo, Mailgun ou SendGrid.
- Trocar `SESSION_SECRET` no `.env` por uma chave segura.
- Em produção maior, trocar o banco local JSON por PostgreSQL, MySQL ou SQLite com backup.

## Estrutura do projeto

```text
manutsmart_real/
├── public/
│   ├── index.html
│   ├── style.css
│   └── app.js
├── data/
│   └── database.json
├── server.js
├── storage.js
├── validators.js
├── mailer.js
├── package.json
├── .env.example
└── README.md
```

## Observação importante

Este é um MVP real e funcional, com backend, login, cadastro, sessão, permissões por função, persistência local e confirmação de email por código. Para uso com muitos usuários simultâneos, recomendo migrar a persistência para um banco de dados profissional.

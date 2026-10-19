# Trilha de Projetos (Next.js + Supabase)

Kanban, Gantt, burndown, fluxo cumulativo e painel de indicadores para projetos em equipe, com:

- **Contas e convites**: quem cria o projeto convida integrantes por e-mail, como **Editor** ou **Leitor**.
- **Responsáveis múltiplos** por tarefa: o criador atribui qualquer integrante, e cada integrante pode se incluir ou sair sozinho (regra que o criador liga ou desliga em *Equipe*).
- **Tempo real**: quando alguém move um cartão, todos veem.
- **Área do administrador** (`/admin`): todos os projetos e usuários, com progresso, atrasos e mensagens não lidas. O admin abre qualquer projeto em modo leitura e comenta com cada integrante.
- **Caixa de mensagens**: conversas individuais entre administrador e integrante, registradas no projeto do aluno, com aviso de não lidas no perfil, na barra superior e no painel do admin, e indicação de "Lida" nas mensagens enviadas.

## 1. Banco de dados

O banco do projeto **trilha** no Supabase já está criado e testado. Falta só ajustar os endereços de login em **Authentication → URL Configuration**:
- **Site URL**: `https://trilha-gestao-projetos.vercel.app`
- **Redirect URLs**: inclua também `http://localhost:3000/` para desenvolvimento.

Para montar o mesmo banco em outro projeto Supabase, cole [`supabase/setup.sql`](supabase/setup.sql) no **SQL Editor** e clique em **Run**.

`jonatas.junior@gmail.com` já está cadastrado como administrador. Vale quando esse e-mail criar a conta no app e confirmar o cadastro. Para incluir outros admins: `insert into public.app_admins (email) values ('outro@email.com');`

## 2. Rodar

```bash
npm install
npm run dev        # http://localhost:3000
```

O arquivo `.env.local` já aponta para o projeto **trilha**. A chave é a publicável, que pode ficar no navegador: a segurança está nas regras do banco.

**Modo demonstração** (sem Supabase, dados fictícios no navegador): `NEXT_PUBLIC_DEMO=1 npm run dev`. Permite entrar como Ana (criadora), Bruno, Carla e Diego (editores), Elisa (leitora) ou Jonatas (admin) para testar cada papel.

## 3. Publicar (gratuito)

O app está publicado na **Vercel** (plano gratuito): **https://trilha-gestao-projetos.vercel.app**. O projeto `trilha-gestao-projetos` da Vercel está ligado a este repositório, e cada push na `main` publica sozinho. As chaves vêm do `.env.local`.

## Prazo, relatório e Google Drive

**Excluir projeto:** aba **Equipe → Excluir projeto…** (só o criador). A confirmação pede para digitar o nome do projeto.

**Prazo de existência (admin):** em **Administração → Prazos e Google Drive**, por projeto (coluna Prazo da tabela), para todos de uma vez, ou como padrão para os projetos novos. A partir de 14 dias antes, os integrantes veem o aviso no topo do projeto. Depois da data, o banco apaga o projeto na limpeza diária (pg_cron, 03:15 de Brasília). Alunos não conseguem alterar o prazo: o banco ignora.

**Limite de integrantes (admin):** em **Administração → Prazos, equipes e Google Drive**, por projeto (coluna Equipe), para todos de uma vez, ou como padrão para os projetos novos. Conta o criador, os integrantes e os convites pendentes. Com a equipe cheia, o criador não consegue convidar e o banco recusa novas entradas. Baixar o limite não remove ninguém. Vazio = sem limite.

**Acesso ao sistema (admin):** em **Administração → Acesso ao sistema**:
- *Domínios permitidos*: só e-mails desses domínios criam conta (começa com `ficr.edu.br`, que aceita também subdomínios). Adicione, edite e remova quantos quiser. Lista vazia = cadastro aberto.
- *E-mails liberados*: exceções avulsas de qualquer domínio.
- *Administradores*: qualquer e-mail; sempre podem se cadastrar.
- Remover só desativa o registro (fica a data). A regra vale no cadastro, na troca de e-mail e nos convites, e é aplicada pelo banco.
- Na tabela **Usuários**: tornar/tirar admin, bloquear/desbloquear e excluir conta (apaga a conta, os projetos que ela criou e as mensagens).

**Relatório PDF:** botão **Relatório PDF** no topo de qualquer projeto. Gerado no navegador, com resumo, burndown, progresso por fase, equipe, prazos vencidos, todas as tarefas e sprints.

**Salvar no Google Drive (com autorização do admin):** o admin libera por projeto ou para todos. O aluno clica em **Salvar no Drive** e o projeto completo vai para o Drive dele como `Nome.trilha.json` (sem mensagens e convites). Em **Abrir arquivo do Drive** (`/arquivo`), o arquivo abre **sem Supabase e sem conta no sistema**, só com o login do Google: quadro, cronograma, métricas e painel funcionam, e as alterações são salvas de volta no mesmo arquivo.

### Configurar o Google Drive (uma vez, gratuito)

1. No [Google Cloud Console](https://console.cloud.google.com/), crie um projeto e ative a **Google Drive API**.
2. Configure a **tela de consentimento OAuth** (Externo) com o escopo `.../auth/drive.file`. Em modo Teste, inclua os e-mails dos alunos em **Usuários de teste** (até 100), ou publique o app.
3. Em **Credenciais → ID do cliente OAuth → Aplicativo da Web**, cadastre as **Origens JavaScript autorizadas**: `http://localhost:3000` e o endereço onde o app for publicado.
4. Coloque o Client ID em `NEXT_PUBLIC_GOOGLE_CLIENT_ID` no `.env.local` (e nas variáveis do projeto na Vercel) e reinicie o `npm run dev`.

O escopo `drive.file` só dá acesso aos arquivos que o próprio Trilha criou: o sistema não enxerga mais nada no Drive do aluno.

## Quem pode o quê

| Ação | Criador | Editor | Leitor | Admin do sistema |
|---|:-:|:-:|:-:|:-:|
| Ver quadro, cronograma, métricas e painel | ✓ | ✓ | ✓ | ✓ (todos os projetos) |
| Criar, editar, mover e excluir tarefas | ✓ | ✓ | | |
| Atribuir qualquer integrante como responsável | ✓ | | | |
| Incluir-se ou sair como responsável | ✓ | ✓ (se permitido) | | |
| Convidar, mudar papéis, remover integrantes | ✓ | | | |
| Regras do projeto, sprints, excluir projeto | ✓ | sprints | | |
| Conversar com o administrador | ✓ | ✓ | ✓ | com cada integrante |

Tudo é garantido pelo banco (Row Level Security), não só pela interface. O histórico de colunas, o remetente e o horário das mensagens são gravados pelo próprio banco e não podem ser forjados.

## Estrutura

```
supabase/
  setup.sql               script único para o SQL Editor
  migrations/             o mesmo, em etapas (esquema, exemplo, admin, convites, prazo, limpeza, limite de equipe, acesso)
  tests/rls.test.mjs      51 testes das regras de acesso num Postgres em memória
  tests/limite.test.mjs   18 testes do limite de integrantes
  tests/acesso.test.mjs   54 testes de domínios, e-mails liberados, admins, bloqueio e exclusão
src/
  app/                    rotas: /entrar, / (projetos), /perfil, /mensagens, /admin,
                          /projeto (quadro, cronograma, métricas, painel, equipe, mensagens)
  data/repo.ts            contrato de dados usado pelo app inteiro
  data/supabaseRepo.ts    implementação com Supabase
  data/demoRepo.ts        implementação de demonstração (sem servidor)
  state/                  sessão + não lidas (AuthProvider) e projeto aberto (ProjectProvider)
  components/             moldura, conversa, caixa de mensagens, UI
  views/                  Kanban, Gantt, Métricas, Painel, editor de tarefa
  lib/metrics.ts          cronograma, caminho crítico, burndown, CFD, lead/cycle time
```

## Modelo de dados

```
profiles(id, email, full_name)                 ← criado junto com a conta
app_admins(email)
projects(id, name, owner_id, wip, self_assign)
project_members(project_id, user_id, role)     ← owner | editor | viewer
project_invites(project_id, email, role)
tasks(id, project_id, title, description, priority, points, status, phase,
      sprint_id, start_date, due_date, milestone, position, created_by, created_at)
task_assignees(task_id, user_id, assigned_by)  ← responsáveis (um ou mais)
task_dependencies(task_id, depends_on)
status_history(task_id, from_status, to_status, changed_by, at)
messages(project_id, user_id, sender_id, task_id, body, created_at, read_at)
```

Uma conversa é o par (projeto, integrante). `read_at` marca quando o outro lado leu, e é isso que alimenta os avisos de não lidas.

## Observação sobre e-mails

O plano gratuito do Supabase envia poucos e-mails de confirmação por hora. Para uma turma inteira se cadastrando no mesmo dia, configure um SMTP próprio em **Authentication → SMTP Settings** (Gmail, Brevo ou similar), ou desative a confirmação de e-mail. Atenção: com a confirmação desligada, alguém poderia criar uma conta com o e-mail do administrador antes de você, então cadastre a sua conta primeiro.

O convite não envia e-mail sozinho: o criador avisa a pessoa (o app mostra o endereço para copiar), ela entra com o e-mail convidado e aceita na lista de projetos.

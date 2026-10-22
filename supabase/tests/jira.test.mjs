// Testa os recursos da migração 0010 (tipos, épicos, checklist, rótulos, comentários,
// notificações, atividade, filtros salvos, colunas personalizáveis e sprints).
// Uso: npm i -D @electric-sql/pglite && node supabase/tests/jira.test.mjs

import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
const M = new URL('../migrations/', import.meta.url).pathname
const db = new PGlite()
let falhas = 0
const ok = (c, m) => {
  if (!c) falhas++
  console.log(c ? '  ✓' : '  ✗ FALHOU:', m)
}

await db.exec(`
create role anon nologin; create role authenticated nologin;
create schema auth;
create table auth.users(id uuid primary key default gen_random_uuid(), email text, email_confirmed_at timestamptz,
  raw_user_meta_data jsonb default '{}', last_sign_in_at timestamptz, banned_until timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true),''),'{}')::jsonb $$;
grant usage on schema public, auth to anon, authenticated;
grant execute on all functions in schema auth to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
create publication supabase_realtime;
`)
for (const f of ['0001_schema.sql', '0002_sample_project.sql', '0003_admin.sql', '0004_convites_e_permissoes.sql', '0005_prazo_e_drive.sql',
  '0007_limite_equipe.sql', '0008_acesso.sql', '0009_mural_equipe.sql', '0010_recursos_jira.sql']) {
  await db.exec(readFileSync(M + f, 'utf8'))
}

const users = {}
for (const [k, email, name] of [['A', 'ana@ficr.edu.br', 'Ana'], ['B', 'bruno@ficr.edu.br', 'Bruno'], ['C', 'carla@ficr.edu.br', 'Carla'],
  ['X', 'xavier@ficr.edu.br', 'Xavier'], ['J', 'jonatas.junior@gmail.com', 'Jonatas']]) {
  const r = await db.query(`insert into auth.users(email, email_confirmed_at, raw_user_meta_data) values ($1, now(), $2) returning id`, [email, JSON.stringify({ full_name: name })])
  users[k] = { id: r.rows[0].id, email }
}
async function as(k, sql, params = []) {
  const u = users[k]
  await db.exec(`reset role;`)
  await db.query(`select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claims', $2, false)`, [u.id, JSON.stringify({ sub: u.id, email: u.email, role: 'authenticated' })])
  await db.exec(`set role authenticated;`)
  try { return await db.query(sql, params) } finally { await db.exec('reset role;') }
}
async function err(k, sql, params = []) { try { await as(k, sql, params); return null } catch (e) { return e.message } }
const one = async (k, sql, params = []) => (await as(k, sql, params)).rows[0]

// equipe: Ana (dona), Bruno (editor), Carla (leitora)
const p = (await one('A', `insert into projects(name) values ('Equipe') returning id`)).id
await as('A', `insert into project_invites(project_id,email,role) values ($1,'bruno@ficr.edu.br','editor'),($1,'carla@ficr.edu.br','viewer')`, [p])
for (const k of ['B', 'C']) await as(k, `select accept_invite((select id from my_invites() limit 1))`)
const p2 = (await one('X', `insert into projects(name) values ('Outra') returning id`)).id

console.log('Tipos de item e épicos')
const t1 = (await one('A', `insert into tasks(project_id,title,kind,points) values ($1,'Tela de login','historia',5) returning id, kind`, [p]))
ok(t1.kind === 'historia', 'tarefa nasce com tipo história')
ok(await err('A', `insert into tasks(project_id,title,kind) values ($1,'x','epico')`, [p]), 'tipo inválido é recusado')
const t2 = (await one('B', `insert into tasks(project_id,title,kind,points) values ($1,'Botão não responde','bug',2) returning id`, [p])).id
const e1 = (await one('B', `insert into epics(project_id,name,color) values ($1,'Autenticação','#d18b1c') returning id`, [p])).id
ok(e1, 'editor cria épico')
ok(await err('C', `insert into epics(project_id,name) values ($1,'x')`, [p]), 'leitora não cria épico')
const eX = (await one('X', `insert into epics(project_id,name) values ($1,'De outro projeto') returning id`, [p2])).id
ok(!(await err('B', `update tasks set epic_id=$2 where id=$1`, [t1.id, e1])), 'tarefa entra no épico')
ok((await err('B', `update tasks set epic_id=$2 where id=$1`, [t1.id, eX]))?.includes('mesmo projeto'), 'épico de outro projeto é recusado')
ok(await err('A', `insert into epics(project_id,name,color) values ($1,'x','vermelho')`, [p]), 'cor precisa ser hexadecimal')

console.log('Rótulos e checklist')
const lFront = (await one('A', `insert into labels(project_id,name,color) values ($1,'front','#5577b0') returning id`, [p])).id
ok(await err('A', `insert into labels(project_id,name) values ($1,' Front ')`, [p]), 'rótulo repetido (sem diferenciar maiúsculas) é recusado')
const lX = (await one('X', `insert into labels(project_id,name) values ($1,'outro') returning id`, [p2])).id
ok(!(await err('B', `insert into task_labels(task_id,label_id) values ($1,$2)`, [t1.id, lFront])), 'editor põe rótulo')
ok((await err('B', `insert into task_labels(task_id,label_id) values ($1,$2)`, [t1.id, lX]))?.includes('mesmo projeto'), 'rótulo de outro projeto é recusado')
ok(await err('C', `insert into task_labels(task_id,label_id) values ($1,$2)`, [t2, lFront]), 'leitora não põe rótulo')
const ck = (await one('B', `insert into checklist_items(task_id,title) values ($1,'Validar e-mail') returning id, project_id`, [t1.id]))
ok(ck.project_id === p, 'item de checklist herda o projeto da tarefa')
await as('B', `insert into checklist_items(task_id,title,position) values ($1,'Mostrar erro de senha',2)`, [t1.id])
const done = (await one('B', `update checklist_items set done=true where id=$1 returning done_by, done_at`, [ck.id]))
ok(done.done_by === users.B.id && done.done_at, 'marcar item grava quem e quando')
ok(await err('C', `update checklist_items set done=false where id=$1`, [ck.id]) === null &&
  (await one('A', `select done from checklist_items where id=$1`, [ck.id])).done === true, 'leitora não desmarca item')

console.log('Comentários, menções e notificações')
await as('A', `insert into task_assignees(task_id,user_id) values ($1,$2)`, [t1.id, users.B.id])
const c1 = (await one('A', `insert into task_comments(task_id,body,mentions,author_id,created_at) values ($1,'@Carla pode revisar?',$2,$3,'2020-01-01') returning author_id, created_at, mentions, project_id`,
  [t1.id, `{${users.C.id},${users.X.id},${users.A.id}}`, users.B.id]))
ok(c1.author_id === users.A.id && new Date(c1.created_at).getFullYear() > 2020, 'autor e horário não podem ser forjados')
ok(c1.mentions.length === 1 && c1.mentions[0] === users.C.id, 'só vale mencionar quem participa (e não a si mesmo)')
ok(!(await err('C', `insert into task_comments(task_id,body) values ($1,'Posso sim')`, [t1.id])), 'leitora comenta')
ok(await err('X', `insert into task_comments(task_id,body) values ($1,'intruso')`, [t1.id]), 'quem não participa não comenta')
ok(!(await err('J', `insert into task_comments(task_id,body,mentions) values ($1,'Bom detalhamento',$2)`, [t1.id, `{${users.A.id}}`])), 'admin comenta e menciona')
const nC = (await as('C', `select * from my_notifications()`)).rows
ok(nC.length === 1 && nC[0].kind === 'mention' && nC[0].actor_name === 'Ana' && nC[0].task_title === 'Tela de login', 'mencionada recebe aviso com autor e tarefa')
const nB = (await as('B', `select kind from my_notifications() order by id`)).rows.map((r) => r.kind)
ok(nB.join() === 'comment,comment,comment', `responsável recebe aviso dos comentários: ${nB}`)
ok((await as('A', `select kind from my_notifications()`)).rows.map((r) => r.kind).join() === 'mention', 'menção do admin chega à dona')
ok((await as('X', `select count(*)::int n from notifications`)).rows[0].n === 0, 'ninguém lê aviso dos outros')
ok((await one('B', `select mark_notifications_read(null, $1) n`, [t1.id])).n === 3, 'marcar como lidos os avisos de uma tarefa')
ok((await as('B', `select count(*)::int n from my_notifications() where read_at is null`)).rows[0].n === 0, 'e eles ficam lidos')
ok(await err('B', `delete from task_comments where author_id=$1`, [users.A.id]) === null &&
  (await one('A', `select count(*)::int n from task_comments where author_id=$1`, [users.A.id])).n === 1, 'ninguém apaga comentário alheio')

console.log('Atividade')
await as('B', `update tasks set due_date='2026-11-10', priority='alta', title='Tela de login e cadastro' where id=$1`, [t1.id])
await as('A', `delete from task_assignees where task_id=$1 and user_id=$2`, [t1.id, users.B.id])
const act = (await as('C', `select action, detail from task_activity where task_id=$1 order by id`, [t1.id])).rows
const acts = act.map((a) => a.action + (a.detail.campo ? ':' + a.detail.campo : ''))
ok(acts[0] === 'criou', 'registra a criação')
ok(['campo:title', 'campo:priority', 'campo:due', 'campo:epic', 'rotulo_entrou', 'checklist_novo', 'checklist_feito', 'responsavel_entrou', 'responsavel_saiu'].every((x) => acts.includes(x)),
  `registra campos, rótulos, checklist e responsáveis: ${acts.join(', ')}`)
ok(act.find((a) => a.detail.campo === 'epic')?.detail.para === 'Autenticação', 'atividade guarda o nome do épico')
ok(await err('B', `insert into task_activity(task_id,project_id,action) values ($1,$2,'forjado')`, [t1.id, p]), 'ninguém escreve atividade direto')
ok((await as('X', `select count(*)::int n from task_activity`)).rows[0].n === 0, 'quem não participa não vê a atividade')
ok(!(await err('A', `delete from tasks where id=$1`, [t2])), 'apagar tarefa com rótulo e responsável não trava nos registros')

console.log('Colunas personalizáveis')
const cols = JSON.stringify([
  { id: 'backlog', label: 'Backlog', category: 'backlog' },
  { id: 'todo', label: 'A fazer', category: 'todo' },
  { id: 'doing', label: 'Desenvolvendo', category: 'doing', wip: 3 },
  { id: 'code-review', label: 'Revisão de código', category: 'review', wip: 2 },
  { id: 'qa', label: 'Teste', category: 'review' },
  { id: 'done', label: 'Feito', category: 'done' },
])
ok(!(await err('A', `update projects set columns=$2 where id=$1`, [p, cols])), 'criadora define as colunas')
ok(await err('B', `update projects set columns=null where id=$1`, [p]) === null &&
  (await one('A', `select columns is not null v from projects where id=$1`, [p])).v, 'editor não muda as colunas')
ok((await err('A', `update projects set columns='[{"id":"a","label":"A","category":"todo"},{"id":"b","label":"B","category":"doing"}]' where id=$1`, [p]))?.includes('Feito'), 'exige uma coluna Feito')
ok((await err('A', `update projects set columns='[{"id":"a","label":"A","category":"todo"},{"id":"a","label":"B","category":"done"}]' where id=$1`, [p]))?.includes('mesmo identificador'), 'recusa colunas repetidas')
ok((await err('A', `update projects set columns='[{"id":"a","label":"A","category":"todo","wip":0},{"id":"b","label":"B","category":"done"}]' where id=$1`, [p]))?.includes('WIP'), 'recusa WIP fora do intervalo')
let r = await one('B', `update tasks set column_key='qa' where id=$1 returning status, column_key`, [t1.id])
ok(r.status === 'review' && r.column_key === 'qa', 'mover para "Teste" põe a tarefa na etapa Revisão')
const hist = (await as('B', `select to_status from status_history where task_id=$1 order by id`, [t1.id])).rows.map((h) => h.to_status)
ok(hist[hist.length - 1] === 'review', 'o histórico (burndown/CFD) registra a etapa')
r = await one('B', `update tasks set column_key='inexistente' where id=$1 returning status, column_key`, [t1.id])
ok(r.column_key === null && r.status === 'review', 'coluna inexistente é ignorada')
await as('B', `update tasks set column_key='code-review' where id=$1`, [t1.id])
r = await one('B', `update tasks set status='done' where id=$1 returning status, column_key`, [t1.id])
ok(r.status === 'done' && r.column_key === null, 'mudar só a etapa solta a coluna antiga')
await as('B', `update tasks set column_key='qa' where id=$1`, [t1.id])
await as('A', `update projects set columns=$2 where id=$1`, [p, JSON.stringify(JSON.parse(cols).filter((c) => c.id !== 'qa'))])
r = await one('B', `select status, column_key from tasks where id=$1`, [t1.id])
ok(r.column_key === null && r.status === 'review', 'remover a coluna devolve o cartão à primeira coluna da etapa')

console.log('Filtros salvos')
const fA = (await one('A', `insert into saved_filters(project_id,name,query,shared,owner_id) values ($1,'Meus bugs','{"kinds":["bug"]}',false,$2) returning id, owner_id`, [p, users.B.id]))
ok(fA.owner_id === users.A.id, 'dono do filtro é quem salvou')
await as('A', `insert into saved_filters(project_id,name,query,shared) values ($1,'Front da equipe','{"labels":[1]}',true)`, [p])
ok((await as('B', `select name from saved_filters`)).rows.map((x) => x.name).join() === 'Front da equipe', 'equipe vê só os filtros compartilhados')
ok(await err('B', `update saved_filters set name='x' where id=$1`, [fA.id]) === null &&
  (await one('A', `select name from saved_filters where id=$1`, [fA.id])).name === 'Meus bugs', 'só o dono edita o filtro')
ok(await err('X', `insert into saved_filters(project_id,name) values ($1,'x')`, [p]), 'quem não participa não salva filtro')

console.log('Sprints')
const s1 = (await one('A', `insert into sprints(project_id,name,start_date,end_date,goal) values ($1,'Sprint 1','2026-10-01','2026-10-14','Login pronto') returning id`, [p])).id
const s2 = (await one('A', `insert into sprints(project_id,name,start_date,end_date) values ($1,'Sprint 2','2026-10-15','2026-10-28') returning id`, [p])).id
const ta = (await one('B', `insert into tasks(project_id,title,points,sprint_id,status) values ($1,'Feita',3,$2,'done') returning id`, [p, s1])).id
const tb = (await one('B', `insert into tasks(project_id,title,points,sprint_id,status,kind) values ($1,'Sobrou',5,$2,'doing','bug') returning id`, [p, s1])).id
ok(await err('C', `select close_sprint($1,$2)`, [s1, s2]), 'leitora não encerra sprint')
const rep = (await one('B', `select close_sprint($1,$2) r`, [s1, s2])).r
ok(rep.committed_points === 8 && rep.completed_points === 3 && rep.carried.length === 1 && rep.bugs_open === 1, `relatório: ${JSON.stringify(rep)}`)
ok((await one('B', `select sprint_id from tasks where id=$1`, [tb])).sprint_id == s2 && (await one('B', `select sprint_id from tasks where id=$1`, [ta])).sprint_id == s1,
  'o que sobrou vai para o próximo sprint; o que foi feito fica')
ok((await one('B', `select closed_at is not null c, report->>'completed_points' cp from sprints where id=$1`, [s1])).cp === '3', 'sprint guarda data e relatório')
ok((await err('B', `select close_sprint($1,null)`, [s1]))?.includes('já foi encerrado'), 'não encerra duas vezes')
ok(!(await err('B', `select reopen_sprint($1)`, [s1])), 'dá para reabrir')

console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo certo')
process.exit(falhas ? 1 : 0)

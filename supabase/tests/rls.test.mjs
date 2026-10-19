// Testa as regras de acesso num Postgres em memória que imita o Supabase.
// Uso: npm i -D @electric-sql/pglite && node supabase/tests/rls.test.mjs

import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
const M = new URL('../migrations/', import.meta.url).pathname
const db = new PGlite()
const ok = (c, m) => console.log(c ? '  ✓' : '  ✗ FALHOU:', m)

await db.exec(`
create role anon nologin; create role authenticated nologin;
create schema auth;
create table auth.users(id uuid primary key default gen_random_uuid(), email text, email_confirmed_at timestamptz,
  raw_user_meta_data jsonb default '{}', last_sign_in_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true),''),'{}')::jsonb $$;
grant usage on schema public, auth to anon, authenticated;
grant execute on all functions in schema auth to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
create publication supabase_realtime;
`)
for (const f of ['0001_schema.sql', '0002_sample_project.sql', '0003_admin.sql', '0004_convites_e_permissoes.sql', '0005_prazo_e_drive.sql', '0007_limite_equipe.sql']) {
  await db.exec(readFileSync(M + f, 'utf8'))
  console.log('aplicado', f)
}

const users = {}
for (const [k, email, confirmed] of [['A','ana@ex.com',1],['B','bruno@ex.com',1],['C','carla@ex.com',1],['D','diego@ex.com',1],['J','jonatas.junior@gmail.com',1],['X','JONATAS.JUNIOR@gmail.com',0]]) {
  const r = await db.query(`insert into auth.users(email, email_confirmed_at, raw_user_meta_data) values ($1, ${confirmed ? 'now()' : 'null'}, $2) returning id`, [email, JSON.stringify({ full_name: k + ' ' + email.split('@')[0] })])
  users[k] = { id: r.rows[0].id, email }
}
async function as(k, sql, params = []) {
  const u = users[k]
  await db.exec(`reset role;`)
  await db.query(`select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claims', $2, false)`, [u.id, JSON.stringify({ sub: u.id, email: u.email, role: 'authenticated' })])
  await db.exec(`set role authenticated;`)
  try { return await db.query(sql, params) } finally { await db.exec('reset role;') }
}
async function fails(k, sql, params = []) { try { const r = await as(k, sql, params); return r.affectedRows === 0 && !r.rows.length ? 'zero' : false } catch (e) { return e.message } }

console.log('Perfis criados:', (await db.query('select count(*) from public.profiles')).rows[0].count)

const p = (await as('A', `insert into projects(name) values ('Projeto Ana') returning id`)).rows[0].id
ok(p, 'dono cria projeto e recebe o id de volta')
ok((await as('A', `select role from project_members where project_id=$1`, [p])).rows[0]?.role === 'owner', 'criador vira dono')
await as('A', `select seed_sample_project($1)`, [p])
const tc = (await as('A', `select count(*)::int n from tasks where project_id=$1`, [p])).rows[0].n
const hc = (await as('A', `select count(*)::int n from status_history where project_id=$1`, [p])).rows[0].n
ok(tc === 20 && hc > 40, `exemplo: ${tc} tarefas, ${hc} registros de histórico`)
ok((await as('A', `select count(*)::int n from status_history where at > now() - interval '1 day'`)).rows[0].n < 5, 'histórico do exemplo é retroativo')
ok(await fails('B', `select seed_sample_project($1)`, [p]), 'não-dono não preenche exemplo')

await as('A', `insert into project_invites(project_id,email,role) values ($1,'bruno@ex.com','editor'),($1,'carla@ex.com','viewer')`, [p])
ok(await fails('B', `insert into project_invites(project_id,email) values ($1,'diego@ex.com')`, [p]), 'só o dono convida')
ok((await as('D', `select * from my_invites()`)).rows.length === 0, 'estranho não vê convites')
ok((await as('D', `select * from project_invites`)).rows.length === 0, 'estranho não lê tabela de convites')
const inv = (await as('B', `select * from my_invites()`)).rows
ok(inv.length === 1 && inv[0].project_name === 'Projeto Ana', 'convidado vê o convite com nome do projeto')
ok(await fails('D', `select accept_invite($1)`, [inv[0].id]), 'outra pessoa não aceita convite alheio')
await as('B', `select accept_invite($1)`, [inv[0].id])
await as('C', `select accept_invite(id) from my_invites()`)
ok((await as('A', `select count(*)::int n from project_members where project_id=$1`, [p])).rows[0].n === 3, '3 integrantes após aceitar')
ok(await fails('D', `insert into project_members(project_id,user_id) values ($1,$2)`, [p, users.D.id]), 'ninguém se adiciona sozinho ao projeto')

ok((await as('B', `select count(*)::int n from tasks`)).rows[0].n === 20, 'editor vê as tarefas')
ok((await as('D', `select count(*)::int n from tasks`)).rows[0].n === 0, 'estranho não vê tarefas')
const t1 = (await as('B', `select id from tasks where project_id=$1 and status='todo' order by id limit 1`, [p])).rows[0].id
await as('B', `update tasks set status='doing' where id=$1`, [t1])
const h = (await as('B', `select from_status, to_status, changed_by from status_history where task_id=$1 order by id desc limit 1`, [t1])).rows[0]
ok(h.from_status === 'todo' && h.to_status === 'doing' && h.changed_by === users.B.id, 'mover cartão gera histórico com autor')
ok(await fails('B', `insert into status_history(project_id,task_id,to_status) values ($1,$2,'done')`, [p, t1]), 'histórico não pode ser forjado')
ok((await as('C', `update tasks set title='x' where id=$1 returning id`, [t1])).rows.length === 0, 'leitor não edita tarefa')

await as('B', `insert into task_assignees(task_id,user_id) values ($1,$2)`, [t1, users.B.id])
ok(true, 'editor se atribui sozinho')
ok(await fails('B', `insert into task_assignees(task_id,user_id) values ($1,$2)`, [t1, users.C.id]), 'editor não atribui outra pessoa')
await as('A', `insert into task_assignees(task_id,user_id) values ($1,$2)`, [t1, users.C.id])
ok(true, 'dono atribui outro integrante')
ok(await fails('A', `insert into task_assignees(task_id,user_id) values ($1,$2)`, [t1, users.D.id]), 'não dá para atribuir quem não é integrante')
ok(await fails('C', `insert into task_assignees(task_id,user_id) values ($1,$2)`, [t1, users.C.id]) || false, 'leitor não se atribui')
const n2 = (await as('A', `select count(*)::int n from task_assignees where task_id=$1`, [t1])).rows[0].n
ok(n2 === 3, `tarefa com ${n2} responsáveis (dono do exemplo + Bruno + Carla)`)
await as('A', `update projects set self_assign=false where id=$1`, [p])
const t2 = (await as('B', `select id from tasks where project_id=$1 and status='backlog' order by id limit 1`, [p])).rows[0].id
ok(await fails('B', `insert into task_assignees(task_id,user_id) values ($1,$2)`, [t2, users.B.id]), 'com autoatribuição desligada, só o dono atribui')
await as('A', `update projects set self_assign=true where id=$1`, [p])
ok(await fails('B', `update projects set name='hack' where id=$1 returning id`, [p]), 'editor não altera o projeto')

ok((await as('B', `select count(*)::int n from profiles`)).rows[0].n === 3, 'integrante vê perfis da equipe (3)')
ok((await as('D', `select count(*)::int n from profiles`)).rows[0].n === 1, 'estranho vê só o próprio perfil')
ok(await fails('B', `update profiles set email='x@x.com' where id=$1`, [users.B.id]), 'e-mail do perfil não pode ser alterado')

// mensagens
ok((await as('J', `select is_admin() a`)).rows[0].a === true, 'admin confirmado é reconhecido')
ok((await as('X', `select is_admin() a`)).rows[0].a === false, 'mesmo e-mail sem confirmação não vira admin')
ok((await as('A', `select is_admin() a`)).rows[0].a === false, 'usuário comum não é admin')
ok((await as('J', `select count(*)::int n from tasks`)).rows[0].n === 20, 'admin vê tarefas de qualquer projeto')
ok((await as('J', `update tasks set title='x' where id=$1 returning id`, [t1])).rows.length === 0, 'admin não edita tarefas (só visualiza)')
await as('J', `insert into messages(project_id,user_id,body,task_id) values ($1,$2,'Bruno, revise o escopo da agenda.',$3)`, [p, users.B.id, t1])
ok(await fails('J', `insert into messages(project_id,user_id,body) values ($1,$2,'oi')`, [p, users.D.id]), 'admin só escreve para integrantes do projeto')
ok(await fails('D', `insert into messages(project_id,user_id,body) values ($1,$2,'oi')`, [p, users.D.id]), 'estranho não escreve no projeto')
ok(await fails('A', `insert into messages(project_id,user_id,body) values ($1,$2,'oi')`, [p, users.B.id]), 'dono não escreve na conversa de outro integrante')
let ib = (await as('B', `select * from inbox()`)).rows
ok(ib.length === 1 && ib[0].unread === 1, 'Bruno tem 1 mensagem não lida')
ok((await as('A', `select count(*)::int n from messages`)).rows[0].n === 0, 'outros integrantes não leem a conversa do Bruno')
await as('B', `insert into messages(project_id,user_id,body,sender_id) values ($1,$2,'Ok, ajusto hoje.',$3)`, [p, users.B.id, users.A.id])
const last = (await as('B', `select sender_id from messages order by id desc limit 1`)).rows[0]
ok(last.sender_id === users.B.id, 'remetente é definido pelo banco (não dá para se passar por outro)')
let ij = (await as('J', `select * from inbox()`)).rows
ok(ij.length === 1 && ij[0].unread === 1 && ij[0].unread_other === 1, 'admin: 1 não lida dele e 1 enviada ainda não lida pelo Bruno')
ok((await as('J', `select unread from admin_projects() where id=$1`, [p])).rows[0].unread === 1, 'painel do admin mostra não lida no projeto')
ok((await as('J', `select unread from admin_users() where id=$1`, [users.B.id])).rows[0].unread === 1, 'painel do admin mostra não lida no usuário')
ok(await fails('B', `select * from admin_projects()`), 'usuário comum não acessa visão do admin')
await as('B', `select mark_thread_read($1,$2)`, [p, users.B.id])
ib = (await as('B', `select * from inbox()`)).rows
ok(ib[0].unread === 0 && ib[0].unread_other === 1, 'Bruno leu; resposta dele ainda não lida pelo admin')
await as('J', `select mark_thread_read($1,$2)`, [p, users.B.id])
ij = (await as('J', `select * from inbox()`)).rows
ok(ij[0].unread === 0 && ij[0].unread_other === 0, 'tudo lido dos dois lados')
ok((await as('B', `update messages set body='editado' returning id`)).rows.length === 0, 'mensagens não podem ser editadas')

// saída de integrante
await as('B', `delete from project_members where project_id=$1 and user_id=$2`, [p, users.B.id])
ok((await as('A', `select count(*)::int n from task_assignees where user_id=$1`, [users.B.id])).rows[0].n === 0, 'quem sai deixa de ser responsável')
ok((await as('B', `select count(*)::int n from messages`)).rows[0].n === 2, 'conversa continua registrada para o usuário')
ok((await as('A', `delete from project_members where project_id=$1 and user_id=$2 returning user_id`, [p, users.A.id])).rows.length === 0, 'dono não sai do próprio projeto')
ok((await as('anonX' in users ? 'A' : 'A', `select 1`)).rows.length === 1, 'fim')
await db.exec('reset role; set role anon;')
try { const r = await db.query('select count(*)::int n from tasks'); ok(false, 'anônimo leu ' + r.rows[0].n) } catch (e) { ok(true, 'anônimo não acessa nada: ' + e.message) }

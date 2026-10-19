// Testa o mural da equipe (migração 0009) num Postgres em memória.
// Uso: npm i -D @electric-sql/pglite && node supabase/tests/mural.test.mjs

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
for (const f of ['0001_schema.sql', '0002_sample_project.sql', '0003_admin.sql', '0004_convites_e_permissoes.sql', '0005_prazo_e_drive.sql', '0007_limite_equipe.sql', '0008_acesso.sql', '0009_mural_equipe.sql']) {
  await db.exec(readFileSync(M + f, 'utf8'))
}

const users = {}
for (const [k, email, name] of [['A', 'ana@ficr.edu.br', 'Ana'], ['B', 'bruno@ficr.edu.br', 'Bruno'], ['C', 'carla@ficr.edu.br', 'Carla'], ['X', 'xavier@ficr.edu.br', 'Xavier'], ['J', 'jonatas.junior@gmail.com', 'Jonatas']]) {
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

console.log('Mural da equipe')
const p = (await as('A', `insert into projects(name) values ('Equipe A') returning id`)).rows[0].id
await as('A', `insert into project_invites(project_id,email,role) values ($1,'bruno@ficr.edu.br','editor'),($1,'carla@ficr.edu.br','viewer')`, [p])
for (const k of ['B', 'C']) {
  const inv = (await as(k, `select id from my_invites()`)).rows[0].id
  await as(k, `select accept_invite($1)`, [inv])
}

ok(!(await err('A', `insert into team_messages(project_id, body) values ($1, 'Oi, equipe!')`, [p])), 'criadora escreve no mural')
ok(!(await err('C', `insert into team_messages(project_id, body) values ($1, 'Leitora também participa')`, [p])), 'leitora escreve no mural')
ok(!(await err('J', `insert into team_messages(project_id, body) values ($1, 'Bom trabalho, pessoal')`, [p])), 'admin escreve no mural sem ser integrante')
ok(await err('X', `insert into team_messages(project_id, body) values ($1, 'intruso')`, [p]), 'quem não é da equipe não escreve')
ok((await as('X', `select count(*)::int n from team_messages`)).rows[0].n === 0, 'quem não é da equipe não lê')
ok(await err('X', `select * from team_thread($1)`, [p]), 'nem pela função do mural')

const forged = (await as('B', `insert into team_messages(project_id, body, sender_id, created_at) values ($1, 'forjada', $2, '2020-01-01') returning sender_id, created_at`, [p, users.A.id])).rows[0]
ok(forged.sender_id === users.B.id && new Date(forged.created_at).getFullYear() > 2020, 'remetente e horário não podem ser forjados')

const th = (await as('B', `select sender_name, sender_is_admin, body from team_thread($1)`, [p])).rows
ok(th.length === 4 && th[0].sender_name === 'Ana' && th[2].sender_name === 'Jonatas' && th[2].sender_is_admin === true && th[0].sender_is_admin === false, 'mural mostra o nome de quem escreveu e identifica o admin')

let inbox = (await as('B', `select * from team_inbox()`)).rows[0]
ok(inbox.unread === 3 && inbox.total === 4, `Bruno tem 3 não lidas (a dele não conta): ${inbox.unread}`)
await as('B', `select mark_team_read($1)`, [p])
ok((await as('B', `select unread from team_inbox()`)).rows[0].unread === 0, 'marcar como lido zera as não lidas')
await as('A', `insert into team_messages(project_id, body) values ($1, 'Reunião amanhã')`, [p])
inbox = (await as('B', `select * from team_inbox()`)).rows[0]
ok(inbox.unread === 1 && inbox.last_body === 'Reunião amanhã' && inbox.last_sender_name === 'Ana', 'nova mensagem aparece como não lida, com prévia e autor')
ok((await as('J', `select count(*)::int n from team_inbox()`)).rows[0].n === 1, 'admin vê os murais de todos os projetos')
ok((await as('X', `select count(*)::int n from team_inbox()`)).rows[0].n === 0, 'quem não é da equipe não vê o mural na caixa')
ok(await err('X', `select mark_team_read($1)`, [p]), 'quem não é da equipe não marca leitura')
ok(await err('B', `update team_messages set body='editada'`) === null && (await as('B', `select count(*)::int n from team_messages where body='editada'`)).rows[0].n === 0, 'mensagens do mural não podem ser editadas')

await as('A', `delete from project_members where project_id=$1 and user_id=$2`, [p, users.B.id])
ok((await as('B', `select count(*)::int n from team_messages`)).rows[0].n === 0, 'quem sai da equipe deixa de ver o mural')

console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo certo')
process.exit(falhas ? 1 : 0)

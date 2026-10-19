// Testa domínios permitidos, e-mails liberados, admins, bloqueio e exclusão (migração 0008).
// Uso: npm i -D @electric-sql/pglite && node supabase/tests/acesso.test.mjs

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
for (const f of ['0001_schema.sql', '0002_sample_project.sql', '0003_admin.sql', '0004_convites_e_permissoes.sql', '0005_prazo_e_drive.sql', '0007_limite_equipe.sql']) {
  await db.exec(readFileSync(M + f, 'utf8'))
}
// conta criada antes da regra (como a do professor)
const pre = await db.query(`insert into auth.users(email, email_confirmed_at) values ('jonatas.junior@gmail.com', now()) returning id`)
await db.exec(readFileSync(M + '0008_acesso.sql', 'utf8'))

const users = { J: { id: pre.rows[0].id, email: 'jonatas.junior@gmail.com' } }
const signup = async (email) => {
  try {
    const r = await db.query(`insert into auth.users(email, email_confirmed_at) values ($1, now()) returning id`, [email])
    return r.rows[0].id
  } catch (e) {
    return 'ERRO: ' + e.message
  }
}
async function as(k, sql, params = []) {
  const u = users[k]
  await db.exec(`reset role;`)
  await db.query(`select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claims', $2, false)`, [u.id, JSON.stringify({ sub: u.id, email: u.email, role: 'authenticated' })])
  await db.exec(`set role authenticated;`)
  try { return await db.query(sql, params) } finally { await db.exec('reset role;') }
}
async function anon(sql, params = []) {
  await db.exec(`reset role;`)
  await db.query(`select set_config('request.jwt.claim.sub', '', false)`)
  await db.exec(`set role anon;`)
  try { return await db.query(sql, params) } finally { await db.exec('reset role;') }
}
async function err(k, sql, params = []) { try { await as(k, sql, params); return null } catch (e) { return e.message } }

console.log('Cadastro por domínio')
const a = await signup('aluna@ficr.edu.br')
ok(!String(a).startsWith('ERRO'), 'e-mail @ficr.edu.br se cadastra')
users.A = { id: a, email: 'aluna@ficr.edu.br' }
ok(!String(await signup('Prof@Aluno.FICR.edu.br')).startsWith('ERRO'), 'subdomínio (aluno.ficr.edu.br) também vale, sem diferenciar maiúsculas')
const g = await signup('alguem@gmail.com')
ok(String(g).startsWith('ERRO') && g.includes('não permitido'), 'gmail é recusado: ' + g)
ok(String(await signup('x@fakeficr.edu.br')).startsWith('ERRO'), 'domínio parecido (fakeficr.edu.br) é recusado')
ok(String(await signup('x@ficr.edu.br.evil.com')).startsWith('ERRO'), 'ficr.edu.br no meio do domínio é recusado')

console.log('Consulta sem login (tela de cadastro)')
ok((await anon(`select can_sign_up('novo@ficr.edu.br') v`)).rows[0].v === true, 'anônimo consulta: ficr permitido')
ok((await anon(`select can_sign_up('novo@gmail.com') v`)).rows[0].v === false, 'anônimo consulta: gmail não permitido')
ok((await anon(`select * from signup_domains()`)).rows.map((r) => r.signup_domains).join() === 'ficr.edu.br', 'anônimo vê os domínios aceitos')
await db.query(`insert into allowed_emails(email) values ('teste@x.com')`)
ok((await anon(`select count(*)::int n from allowed_emails`)).rows[0].n === 0, 'anônimo não lê a lista de e-mails liberados')
await db.query(`delete from allowed_emails`)
try { await anon(`select email_allowed('a@b.com')`); ok(false, 'função interna exposta') } catch { ok(true, 'função interna não fica exposta') }

console.log('Administração de domínios e e-mails')
ok(await err('A', `select admin_add_domain('gmail.com')`), 'aluno não adiciona domínio')
ok((await as('A', `select count(*)::int n from allowed_domains`)).rows[0].n === 0, 'aluno não enxerga a lista de domínios')
ok(!(await err('J', `select admin_add_domain(' @Exemplo.COM ', 'parceiro')`)), 'admin adiciona domínio (normaliza "@Exemplo.COM")')
ok(!String(await signup('p@exemplo.com')).startsWith('ERRO'), 'novo domínio passa a valer')
ok((await err('J', `select admin_add_domain('exemplo.com')`))?.includes('já está'), 'domínio repetido avisa')
ok((await err('J', `select admin_add_domain('não é domínio')`))?.includes('inválido'), 'domínio inválido avisa')
ok(!(await err('J', `select admin_update_domain('exemplo.com', 'exemplo.org', 'renomeado')`)), 'admin edita domínio')
ok((await as('J', `select domain, note from allowed_domains where domain='exemplo.org'`)).rows[0]?.note === 'renomeado', 'edição gravada')
ok(!(await err('J', `select admin_remove_domain('exemplo.org')`)), 'admin remove domínio')
ok(String(await signup('q@exemplo.org')).startsWith('ERRO'), 'domínio removido deixa de valer')
ok((await as('J', `select admin_access_lists() l`)).rows[0].l.domains.every((d) => d.domain !== 'exemplo.org'), 'domínio removido some da lista')
ok((await db.query(`select removed_at from allowed_domains where domain='exemplo.org'`)).rows[0]?.removed_at, 'mas fica registrado quando foi removido')
ok(!(await err('J', `select admin_add_domain('exemplo.org')`)), 'domínio removido pode ser adicionado de novo')
ok(!String(await signup('r@exemplo.org')).startsWith('ERRO'), 'e volta a valer')
ok(!(await err('J', `select admin_update_domain('exemplo.org', 'exemplo.net', '')`)), 'renomear para outro nome')
ok(!(await err('J', `select admin_update_domain('exemplo.net', 'exemplo.org', 'de volta')`)), 'renomear de volta para um nome já removido')
ok((await as('J', `select admin_access_lists() l`)).rows[0].l.domains.filter((d) => d.domain.startsWith('exemplo')).map((d) => d.domain).join() === 'exemplo.org', 'só o nome atual aparece ativo')
await as('J', `select admin_remove_domain('exemplo.org')`)

ok(!(await err('J', `select admin_add_email('Convidado@Gmail.com', 'monitor externo')`)), 'admin libera e-mail avulso')
const c = await signup('convidado@gmail.com')
ok(!String(c).startsWith('ERRO'), 'e-mail liberado se cadastra mesmo fora do domínio')
users.C = { id: c, email: 'convidado@gmail.com' }
const lists = (await as('J', `select admin_access_lists() l`)).rows[0].l
ok(lists.emails[0].registered === true && lists.domains[0].users >= 2, 'listas mostram quem já tem conta e quantos por domínio')
await as('J', `select admin_remove_email('convidado@gmail.com')`)
ok(String(await signup('outro@gmail.com')).startsWith('ERRO'), 'sem a liberação, gmail volta a ser recusado')

console.log('Administradores')
ok(!(await err('J', `select admin_add_admin('Coordenacao@outlook.com')`)), 'admin adiciona outro admin de qualquer domínio')
const k = await signup('coordenacao@outlook.com')
ok(!String(k).startsWith('ERRO'), 'admin novo se cadastra mesmo fora do domínio')
users.K = { id: k, email: 'coordenacao@outlook.com' }
ok((await as('K', `select is_admin() v`)).rows[0].v === true, 'e passa a ser reconhecido como admin')
ok((await err('J', `select admin_remove_admin('jonatas.junior@gmail.com')`))?.includes('própria'), 'admin não tira a própria permissão')
ok(await err('A', `select admin_add_admin('aluna@ficr.edu.br')`), 'aluno não se promove a admin')
ok((await err('K', `select admin_remove_admin('coordenacao@outlook.com')`))?.includes('própria'), 'admin novo também não tira a própria permissão')
ok(!(await err('J', `select admin_remove_admin('coordenacao@outlook.com')`)), 'admin tira a permissão de outro')
ok((await as('K', `select is_admin() v`)).rows[0].v === false, 'quem saiu deixa de ser admin')

console.log('Convites')
const p = (await as('A', `insert into projects(name) values ('Equipe') returning id`)).rows[0].id
ok(!(await err('A', `insert into project_invites(project_id,email) values ($1,'colega@ficr.edu.br')`, [p])), 'convite para e-mail institucional funciona')
ok((await err('A', `insert into project_invites(project_id,email) values ($1,'fulano@hotmail.com')`, [p]))?.includes('não pode se cadastrar'), 'convite para e-mail de fora é recusado com explicação')
ok(!(await err('A', `insert into project_invites(project_id,email) values ($1,'convidado@gmail.com')`, [p])), 'convite para quem já tem conta funciona mesmo fora do domínio')

console.log('Bloqueio, exclusão e troca de e-mail')
ok(!(await err('J', `select admin_set_blocked($1, true)`, [users.A.id])), 'admin bloqueia aluno')
ok((await db.query(`select banned_until from auth.users where id=$1`, [users.A.id])).rows[0].banned_until !== null, 'conta fica com bloqueio')
const u2 = (await as('J', `select email, blocked, is_admin, owned_projects from admin_users_v2() order by email`)).rows
ok(u2.find((r) => r.email === 'aluna@ficr.edu.br')?.blocked === true && u2.find((r) => r.email === 'jonatas.junior@gmail.com')?.is_admin === true, 'lista de usuários mostra bloqueio e admin')
ok(!(await err('J', `select admin_set_blocked($1, false)`, [users.A.id])), 'admin desbloqueia')
ok((await err('J', `select admin_set_blocked($1, true)`, [users.J.id]))?.includes('própria'), 'admin não bloqueia a si mesmo')
ok(await err('A', `select admin_set_blocked($1, true)`, [users.C.id]), 'aluno não bloqueia ninguém')
let mudou = null
try { await db.query(`update auth.users set email='aluna@gmail.com' where id=$1`, [users.A.id]) } catch (e) { mudou = e.message }
ok(mudou && mudou.includes('não permitido'), 'trocar o e-mail para fora do domínio é recusado')
ok(await err('A', `select admin_delete_user($1)`, [users.C.id]), 'aluno não exclui contas')
ok((await err('J', `select admin_delete_user($1)`, [users.J.id]))?.includes('própria'), 'admin não exclui a si mesmo')
ok(!(await err('J', `select admin_delete_user($1)`, [users.A.id])), 'admin exclui a conta da aluna')
ok((await db.query(`select count(*)::int n from projects where id=$1`, [p])).rows[0].n === 0, 'projetos criados por ela somem junto')
ok((await db.query(`select count(*)::int n from profiles where id=$1`, [users.A.id])).rows[0].n === 0, 'perfil removido')

console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo certo')
process.exit(falhas ? 1 : 0)

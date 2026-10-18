import Link from 'next/link'

// Política de privacidade pública (exigida pelo Google para publicar o app OAuth).
// Abre sem login: o AppShell libera esta rota.

export const metadata = {
  title: 'Política de privacidade · Trilha de Projetos',
  description: 'Como o Trilha de Projetos trata os dados dos usuários e o acesso ao Google Drive.',
}

const ATUALIZADA = '18 de outubro de 2026'
const CONTATO = 'jonatas.junior@gmail.com'

export default function PrivacidadePage() {
  return (
    <main className="legal">
      <article className="legal-card">
        <Link href="/" className="brand-mark">Trilha</Link>
        <h1>Política de privacidade</h1>
        <p className="hint">Última atualização: {ATUALIZADA}</p>

        <p>
          O <strong>Trilha de Projetos</strong> é uma ferramenta acadêmica gratuita de gestão de projetos em equipe
          (quadro Kanban, cronograma, métricas e painel), usada em disciplinas sob orientação do professor
          responsável. Esta página explica quais dados o app guarda, para quê, e como funciona o acesso ao Google Drive.
        </p>

        <h2>1. Dados que guardamos</h2>
        <ul>
          <li><strong>Conta:</strong> nome e e-mail informados no cadastro. A senha é guardada de forma criptografada pelo serviço de login (Supabase Auth) e ninguém da equipe tem acesso a ela.</li>
          <li><strong>Projetos:</strong> nome do projeto, integrantes e papéis, tarefas (título, descrição, prioridade, pontos, fase, datas, responsáveis, dependências), sprints e o histórico de mudanças de coluna.</li>
          <li><strong>Mensagens:</strong> conversas entre o administrador e cada integrante dentro de um projeto, com data e indicação de leitura.</li>
        </ul>
        <p>
          Esses dados ficam num banco de dados Supabase hospedado em São Paulo (Brasil). O site é servido pela Vercel.
          Não usamos cookies de publicidade nem ferramentas de rastreamento, e não vendemos nem compartilhamos dados com terceiros.
        </p>

        <h2>2. Quem vê os dados</h2>
        <ul>
          <li>Os integrantes de um projeto veem o conteúdo desse projeto, conforme o papel (criador, editor ou leitor).</li>
          <li>O administrador do sistema (o professor responsável) pode ver todos os projetos, em modo leitura, para acompanhar e orientar as equipes, e trocar mensagens com os integrantes.</li>
          <li>As regras de acesso são aplicadas pelo próprio banco de dados, e não só pela interface.</li>
        </ul>

        <h2>3. Google Drive</h2>
        <p>
          O uso do Google Drive é opcional e só fica disponível quando o administrador autoriza. Ao clicar em
          {' '}<em>Salvar no Drive</em> ou <em>Abrir arquivo do Drive</em>, o Google pede sua permissão para o escopo
          {' '}<code>drive.file</code>. Com ele, o app:
        </p>
        <ul>
          <li>cria no seu Drive um arquivo <code>.trilha.json</code> com os dados do projeto (sem mensagens e convites);</li>
          <li>lê e atualiza <strong>apenas</strong> os arquivos que o próprio Trilha criou ou que você escolheu abrir nele;</li>
          <li><strong>não</strong> enxerga, lista nem altera nenhum outro arquivo do seu Drive.</li>
        </ul>
        <p>
          A comunicação com o Drive acontece diretamente entre o seu navegador e o Google. A chave de acesso fornecida
          pelo Google fica só na memória da página, expira em cerca de uma hora e nunca é enviada ao nosso servidor
          nem gravada no banco. Os arquivos salvos no Drive são seus: você pode apagá-los quando quiser, e pode
          revogar o acesso a qualquer momento em{' '}
          <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">myaccount.google.com/permissions</a>.
        </p>
        <p>
          O uso e a transferência de informações recebidas das APIs do Google seguem a{' '}
          <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">
            Política de Dados do Usuário dos Serviços de API do Google
          </a>
          , incluindo os requisitos de Uso Limitado. Os dados do Drive não são usados para publicidade nem para
          treinar modelos de inteligência artificial.
        </p>

        <h2>4. Por quanto tempo</h2>
        <p>
          O administrador pode definir um prazo de existência para cada projeto. Os integrantes são avisados com
          antecedência e, depois da data, o projeto e todas as suas tarefas e mensagens são apagados automaticamente.
          O criador também pode excluir o projeto a qualquer momento. Antes disso, é possível baixar o relatório em PDF
          ou salvar uma cópia no seu Google Drive.
        </p>

        <h2>5. Seus direitos (LGPD)</h2>
        <p>
          Você pode pedir acesso, correção ou exclusão dos seus dados e da sua conta escrevendo para{' '}
          <a href={`mailto:${CONTATO}`}>{CONTATO}</a>. Atendemos os pedidos conforme a Lei Geral de Proteção de Dados
          (Lei nº 13.709/2018).
        </p>

        <h2>6. Contato</h2>
        <p>
          Responsável: Jonatas, professor da Faculdade Integrada do Recife (FICR). E-mail:{' '}
          <a href={`mailto:${CONTATO}`}>{CONTATO}</a>.
        </p>

        <p className="legal-back">
          <Link href="/">Voltar ao Trilha</Link>
        </p>
      </article>
    </main>
  )
}

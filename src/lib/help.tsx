// Explicações das métricas, usadas nos botões "?" das abas Métricas, Painel e Cronograma.

export const HELP = {
  burndown: (
    <>
      <p><b>Como ler:</b> o eixo vertical mostra os pontos que ainda faltam no sprint. A linha tracejada é o ritmo ideal, saindo do total no primeiro dia e chegando a zero no último. A linha verde é o real, calculada pelo histórico de colunas: só cai quando uma tarefa chega em Feito.</p>
      <p><b>Sinais de alerta:</b> linha verde acima da tracejada significa atraso. Linha reta por vários dias significa que nada está sendo concluído, geralmente por tarefas grandes demais ou travadas.</p>
      <p><b>O que fazer:</b> quebrar tarefas grandes, terminar antes de começar outras ou tirar escopo do sprint.</p>
    </>
  ),
  burnup: (
    <>
      <p><b>Como ler:</b> a linha verde é o total de pontos concluídos até cada dia. A linha tracejada escura é o escopo: a soma dos pontos das tarefas do sprint que já existiam naquele dia. O sprint termina quando as duas se encontram.</p>
      <p><b>Diferença para o burndown:</b> aqui dá para ver quando entra trabalho novo no meio do sprint, porque a linha de escopo sobe. No burndown isso fica escondido.</p>
      <p><b>Sinais de alerta:</b> escopo subindo durante o sprint ou distância entre as linhas que não diminui.</p>
    </>
  ),
  cfd: (
    <>
      <p><b>Como ler:</b> cada faixa colorida é uma coluna do quadro. A espessura de uma faixa num dia é quantas tarefas estavam naquela coluna ao fim do dia, e o topo do gráfico é o total de tarefas do projeto.</p>
      <p><b>Sinais de alerta:</b> uma faixa do meio (Fazendo ou Revisão) engrossando indica gargalo, porque entra trabalho mais rápido do que sai. A faixa verde (Feito) parada indica que nada está sendo entregue.</p>
      <p><b>O que fazer:</b> definir ou baixar o limite de WIP da coluna que acumula e concentrar a equipe em terminar o que já começou.</p>
    </>
  ),
  flow: (
    <>
      <p><b>Lead time:</b> dias entre a criação da tarefa e a chegada em Feito. É o tempo que quem pediu espera pela entrega.</p>
      <p><b>Cycle time:</b> dias entre a primeira vez em Fazendo e a chegada em Feito. É o tempo de trabalho efetivo.</p>
      <p><b>Nas barras:</b> a parte cinza é a espera antes de começar e a parte verde é a execução. Muita espera indica fila longa no backlog; muita execução indica tarefas grandes ou bloqueadas.</p>
      <p><b>Para que serve:</b> prever prazos com base no histórico real da equipe, em vez de no palpite.</p>
    </>
  ),
  health: (
    <>
      <p><b>Vermelho (em risco):</b> alguma tarefa de prioridade alta ou crítica está com prazo vencido, ou mais de 20% das tarefas abertas estão atrasadas.</p>
      <p><b>Amarelo (atenção):</b> existe alguma tarefa atrasada, alguma coluna passou do limite de WIP ou o sprint atual está mais de 25% acima da linha ideal do burndown.</p>
      <p><b>Verde (no prazo):</b> nenhuma das situações acima. Os motivos aparecem listados ao lado do semáforo.</p>
    </>
  ),
  done: <p>Pontos das tarefas em Feito divididos pelo total de pontos do projeto. Mede o esforço concluído, não a quantidade de tarefas. Marcos não contam porque não têm pontos.</p>,
  late: <p>Tarefas com prazo anterior a hoje que ainda não estão em Feito. Aparecem em vermelho no quadro e no cronograma.</p>,
  lead: <p>Média de dias entre criar uma tarefa e concluí-la. Inclui o tempo de espera na fila. Detalhes por tarefa na aba Métricas.</p>,
  cycle: <p>Média de dias entre começar uma tarefa (entrar em Fazendo) e concluí-la. Mostra o ritmo real de execução da equipe.</p>,
  end: <p>A data de fim mais distante no cronograma, contando as datas estimadas. Ela usa as datas planejadas: uma tarefa atrasada não empurra a data sozinha, então atualize os prazos para a previsão continuar realista.</p>,
  phases: (
    <>
      <p><b>Como ler:</b> cada barra é uma fase do ciclo de vida do produto, colorida pela coluna em que estão as tarefas (verde é Feito). A porcentagem é a parte dos pontos da fase já concluída.</p>
      <p><b>Sinal de alerta:</b> fases avançadas com progresso enquanto fases anteriores ficaram pela metade, como desenvolver antes de validar o problema.</p>
    </>
  ),
  throughput: (
    <>
      <p><b>Como ler:</b> quantas tarefas chegaram em Feito em cada uma das últimas 6 semanas. A última barra é a semana atual, ainda em andamento. A linha tracejada é a média.</p>
      <p><b>Para que serve:</b> estimar quando o trabalho termina. Se faltam 12 tarefas e a média é 3 por semana, a previsão é de cerca de 4 semanas.</p>
    </>
  ),
  overdue: <p>Tarefas com prazo vencido, da mais atrasada para a menos atrasada, com responsáveis e coluna atual. Clique numa delas para abrir.</p>,
  load: (
    <>
      <p><b>Como ler:</b> pontos das tarefas em aberto de cada pessoa, coloridos pela coluna. Uma tarefa com dois responsáveis conta inteira para cada um.</p>
      <p><b>Sinal de alerta:</b> uma pessoa com muito mais pontos que as outras, ou tarefas acumuladas em "Sem responsável".</p>
    </>
  ),
  milestones: <p>Entregas-chave do projeto, em ordem de data. Verde é entregue, vermelho é atrasado e preto ainda está no prazo.</p>,
  gantt: (
    <>
      <p><b>Barras:</b> cada tarefa vai do início ao prazo, na cor da coluna em que está. Barras tracejadas têm data estimada: o app calcula pela pontuação (1 ponto ≈ 1 dia) e pelo fim das dependências.</p>
      <p><b>Setas:</b> ligam o fim de uma tarefa ao início da que depende dela. <b>Losangos</b> são marcos.</p>
      <p><b>Caminho crítico (contorno vermelho):</b> a cadeia de dependências que termina por último. Qualquer atraso nela atrasa o projeto inteiro, então é onde a equipe deve ficar de olho primeiro.</p>
      <p><b>Linha verde vertical:</b> o dia de hoje. Barras que terminam antes dela e não estão verdes estão atrasadas.</p>
    </>
  ),
}

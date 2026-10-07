# Atualização V25.46.54 — Importação de Projeto Qualidade

Comece pelo arquivo **COMECE_AQUI_V25_46_54.md**. Atualize os arquivos do site e execute **docs/16_ANOTACOES_PLANEJAMENTO_QUALIDADE.sql** depois da estrutura do Planejamento.

# Atualização V25.46.53 — Responsáveis

Comece pelo arquivo **COMECE_AQUI_V25_46_53.md**. Esta atualização não exige SQL novo.

# Atualização V25.46.52 — Planejamento

Comece pelo arquivo **COMECE_AQUI_V25_46_52.md**. A instalação desta atualização usa apenas **docs/15_INSTALAR_PLANEJAMENTO.sql**.

# BI-Monday V25.46.51 — Atualizar fila

Consulte LEIA_AJUSTE_V25_46_51.md para instalar a correção do botão. Atualize index.html e js/certificados.js. Nenhuma alteração na configuração de envio é executada por esta atualização.

BI-Monday V25.46.43 — Fluxo de aprovação do release

Base: V25.46.42.

Escopo desta versão
- Alteração funcional somente no módulo Projeto Qualidade / release.
- Certificados, Reunião NQ, Operação, filtros globais e demais módulos foram preservados.

Novo fluxo
1. Rascunho
   - Pode ser salvo incompleto.
   - Uma versão salva permanece protegida; para editar, use “Usar como base”.
2. Em revisão
   - Pode ser criada diretamente pelo botão “Enviar para revisão” ou a partir de um rascunho salvo.
   - Exige os itens essenciais do checklist.
   - O conteúdo fica bloqueado para impedir alterações acidentais durante a revisão.
3. Finalizado
   - Só pode ocorrer a partir de uma versão “Em revisão”.
   - O botão passa a ser “Aprovar e gerar PDF”.
   - A versão finalizada fica protegida e preservada no histórico.
   - Para evoluir o documento, use “Usar como base” e crie uma nova versão.

Auditoria do workflow
- Registra quem enviou para revisão e quando.
- Registra quem aprovou/finalizou e quando.
- O histórico mostra Rascunho, Em revisão e Finalizado com identificação visual.
- As versões antigas continuam compatíveis.

Tarefas do release
- As decisões já salvas em tarefas_release continuam imutáveis na fotografia da versão.
- A atualização opcional do status real da tarefa agora pode ocorrer mesmo quando a revisão/finalização acontece em outro dia.
- A autorização para alterar a tarefa fica vinculada à pessoa que acabou de aprovar/finalizar a versão.

Instalação
1. O SQL da V25.46.40 (tratamento de tarefas) deve continuar instalado.
2. Execute no Supabase > SQL Editor:
   docs/08_FLUXO_APROVACAO_RELEASE_V25_46_43.sql
3. O resultado final da consulta de conferência deve mostrar:
   - coluna_revisao = true
   - coluna_finalizacao = true
   - funcao_check = pq_release_workflow_disponivel()
   - funcao_salvar = pq_salvar_edicao_workflow(...)
   - funcao_revisao = pq_enviar_edicao_revisao(bigint)
   - funcao_finalizar = pq_finalizar_edicao(bigint)
   - funcao_status_tarefa = pq_aplicar_status_tarefa(bigint,bigint,text)
4. Publique os arquivos no GitHub Pages.
5. Faça Ctrl + F5.

Teste recomendado
1. Abra um projeto e use “Usar como base” se houver uma versão finalizada/em revisão.
2. Preencha o relatório e salve como Rascunho.
3. Confirme no histórico o status “Rascunho”.
4. Clique “Enviar rascunho para revisão”.
5. Confirme que o status muda para “Em revisão” e os campos ficam bloqueados.
6. Clique “Aprovar e gerar PDF”.
7. Confirme “Finalizado”, PDF gerado e histórico preservado.
8. Abra a versão finalizada e confirme que não é possível editar.
9. Clique “Usar como base” e confirme que uma nova versão pode ser criada sem alterar a finalizada.

Arquivos funcionais alterados
- projetos.html
- js/projetos.js
- css/projetos.css

Novo SQL
- docs/08_FLUXO_APROVACAO_RELEASE_V25_46_43.sql

## V25.46.44 — Filtro Enviado/Pendente em Certificados

Alteração restrita à aba Certificados:

- novo filtro **Envio** com `Enviados e pendentes`, `Pendentes` e `Enviados`;
- o filtro atua por certificado individual (UA + revisor), preservando múltiplos revisores;
- o relatório Excel respeita o novo filtro e registra a seleção na aba Resumo;
- demais filtros, auditoria de revisor, geração/envio, Projeto Qualidade, Reunião NQ e Operação foram preservados.

Não há SQL novo nesta versão.

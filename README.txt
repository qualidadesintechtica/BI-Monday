BI Monday - DataHub Validação de Materiais
Versão: 2026-08-15 v8

Fonte principal do dashboard:
public.vw_validacao_bi_consolidada

Arquitetura:
- monday_esteira_producao / vw_esteira_uas: universo planejado de UAs.
- monday_validacao_materiais: execução da validação.
- vw_validacao_bi_consolidada: uma linha por UA lógica, cruzando planejamento e execução.

KPIs principais usam os flags da view:
- Total UAs: quantidade de linhas/chave_ua.
- Liberadas: foi_liberada = true.
- Não liberadas: nao_liberada = true.
- Validadas: eh_validada = true.
- Em NQ: eh_nq = true.
- Em ajuste: eh_ajuste = true.

Referência validada para Jun a Ago/26 (Regular):
Total 731 | Liberadas 589 | Não liberadas 142 | Validadas 434 | NQ 91 | Ajustes 33.

Observação:
A view consolidada não possui a contagem histórica de retornos/ajustes por UA. A página Ajustes representa o estado atual das UAs em ajuste, sem inventar ocorrências históricas.

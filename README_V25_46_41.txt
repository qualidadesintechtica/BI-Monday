# BI-Monday V25.46.41 — Certificados: UA normalizada + correção auditada de revisor

Esta versão parte da V25.46.40 e altera apenas o fluxo de Certificados e a Edge Function `monday-revisores`.

## O que mudou

1. **Normalização de UA**
   - `UNIDADE 1`, `UNIDADE 01`, `UA 1`, `UA01` e `UA 01` passam a representar a mesma UA.
   - A exibição é padronizada como `UNIDADE 01`, `UNIDADE 02`, etc.
   - O cruzamento Monday ↔ base consolidada usa a mesma normalização.

2. **Monday ao vivo com Matriz e Semestre**
   - A Edge Function `monday-revisores` passa a ler também `matriz_oferta` e `semestre_oferta` diretamente do board.
   - Isso reduz a dependência do cruzamento por nome e evita perda de UAs quando o nome está com zero à esquerda diferente.

3. **Correção auditada de revisor**
   - Cada linha de certificado possui o botão **Corrigir**.
   - A correção salva nome original da Monday, nome corrigido, e-mail, motivo, data e usuário.
   - O histórico é preservado: um ajuste anterior é desativado, nunca apagado.
   - O botão **Usar Monday** desativa a correção atual e volta a usar o responsável vigente na Monday.

4. **Revisor da Monday fora da base oficial não bloqueia certificado**
   - Se houver nome e e-mail válidos, continua elegível.
   - A situação aparece como `Cadastro oficial pendente`.

5. **Relatório de certificados**
   - Passa a trazer `Revisor original (Monday)` e `Motivo da correção`.

## Instalação

1. Execute no Supabase SQL Editor:
   `docs/07_CERTIFICADOS_AJUSTE_REVISOR_V25_46_41.sql`
2. Reimplante a Edge Function:
   `supabase/functions/monday-revisores/index.ts`
3. Publique o site no GitHub Pages.
4. Faça `Ctrl + F5`.

## Caso de uso

Se a Monday hoje mostrar Alexandre em uma UA, mas Alexia foi quem efetivamente validou:
- clique em **Corrigir**;
- selecione/informe Alexia;
- confirme o motivo;
- o certificado e o relatório passam a usar Alexia;
- a Monday não é alterada;
- a correção fica auditada no Supabase.

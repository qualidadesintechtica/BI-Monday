# BI-Monday V25.46.58 — Aprovação e PDF com UUID

## O erro da Política Editorial

A mensagem `invalid input syntax for type bigint: "..."` mostra que a aprovação recebeu um ID UUID em uma função cuja entrada era numérica. A correção anterior tratava a regra de status, mas não essa incompatibilidade de identificadores.

A V25.46.58 usa uma nova função de transição com entrada textual e o tipo real do ID da tabela. Funciona em bases com UUID ou bigint, mantém as etapas de revisão/aprovação e não converte, renumera ou recria as versões salvas.

## Instalar sobre a V25.46.57

1. Extraia este ZIP.
2. No **Supabase > SQL Editor** do BI, execute inteiro **docs/19_CORRIGIR_APROVACAO_PDF_UUID.sql**.
3. O resultado deve mostrar `tipo_id_preservado` e `funcao_aprovacao`. Em uma tabela UUID, o primeiro será `uuid`.
4. Publique no site estes arquivos, mantendo os caminhos:
   - `index.html`
   - `projetos.html`
   - `js/projetos.js`
5. Recarregue com **Ctrl + F5**. A identificação da página deve mostrar **v25.46.58**.
6. Abra **Política Editorial**, selecione **Ver versão** na versão **Em revisão** e clique em **Aprovar e gerar PDF**.

O SQL 19 já inclui o ajuste da constraint de status do SQL 18. Não é necessário executar o SQL 18 de novo. Execute o SQL 19 junto com a atualização das páginas: o banco precisa da nova função e o site precisa usá-la.

Se o erro ocorrer antes de a aprovação terminar, a versão continua Em revisão. Depois da instalação, use essa mesma versão; não é necessário copiar o relatório nem criar outra. O conteúdo, as evidências, a fotografia da origem e o ID permanecem iguais.

## Se ainda estiver na V25.46.54

Este pacote também mantém as correções anteriores de Planejamento. Execute o **SQL 17** para gravar o status dos cartões importados, além do **SQL 19** para a aprovação/PDF. Substitua também `js/planejamento.js`, `js/paginas.js` e `js/certificados.js`, conforme o guia V25.46.57. Os SQLs 15 e 16 continuam sendo pré-requisitos do Planejamento.

## Escopo e validação

A nova função cobre as transições Rascunho → Em revisão e Em revisão → Finalizado. A aprovação altera apenas o status e os campos de auditoria do fluxo; a geração do PDF continua usando o relatório da versão salva. As rotinas existentes de indicadores NQ e atualização opcional da base de tarefas permanecem as mesmas.

Testes locais com tabelas de ID UUID e bigint: erro anterior reproduzido, migração reaplicável, aprovação pela interface, download real do PDF, conteúdo e ID preservados, histórico após recarregar e acesso institucional. Produção precisa receber os passos de instalação acima.

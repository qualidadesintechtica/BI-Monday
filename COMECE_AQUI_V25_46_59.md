# BI-Monday V25.46.59 — Tabelas completas e reimpressão

## Alterações

- O PDF agora escolhe as quebras entre as linhas das tabelas e do texto. Uma linha de tabela que cabe em uma página permanece inteira.
- Valores muito longos são distribuídos por páginas respeitando as linhas de texto, sem reduzir a fonte nem descartar o conteúdo.
- Tabelas com cabeçalho repetem esse cabeçalho quando continuam em outra página. Textos e links longos se ajustam à largura do papel.
- Os links das evidências continuam clicáveis, com posições calculadas para as novas quebras de página.
- O histórico de cada versão salva tem **Reimprimir relatório**. Na versão finalizada, o botão principal também passa a mostrar essa opção.
- Reimprimir baixa um novo PDF da mesma versão. Não cria uma edição, não exige nova aprovação e não modifica conteúdo, status ou auditoria.

## Instalar sobre a V25.46.58

Não há SQL novo nesta atualização. Publique os cinco arquivos abaixo, mantendo os caminhos:

1. `index.html`
2. `projetos.html`
3. `css/projetos.css`
4. `js/projetos.js`
5. **`js/projetos-pdf.js` — arquivo novo, necessário para a paginação.**

Depois, recarregue com **Ctrl + F5** e confira a identificação **v25.46.59**.

As correções anteriores continuam no pacote. Se o SQL 19 da V25.46.58 ainda não estiver instalado, use o guia dessa versão para corrigir a aprovação com IDs UUID; esta atualização de layout não reinstala o banco.

## Reimprimir a Política Editorial

1. Abra **Política Editorial**.
2. No **Histórico de versões**, clique em **Reimprimir relatório** na versão desejada, ou abra a versão finalizada e use o botão principal com esse nome.
3. Abra o PDF baixado para visualizar ou imprimir. O nome do arquivo mantém o número da versão.

O arquivo já baixado anteriormente não é alterado pela atualização do site. Reimprima a versão salva para obter o PDF com as quebras corrigidas.

## Conferência

Confira a linha **ResultadosEsperados** da tabela de informações originais e as tabelas de tarefas/evidências. Textos que cabem em uma página devem permanecer completos, e a reimpressão deve manter o mesmo número de versão no histórico.

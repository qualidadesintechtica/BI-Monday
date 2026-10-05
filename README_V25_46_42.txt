BI-Monday V25.46.42 — Evidências estruturadas no release

Base: V25.46.41.

Escopo desta versão
- Alteração funcional somente no módulo Projeto Qualidade / release.
- Certificados, Reunião NQ, Operação, filtros globais e demais módulos foram preservados.

O que mudou
1. Cada evidência recebe numeração automática: Evidência 01, 02, 03...
2. Cada evidência possui a opção “Incluir no relatório”.
   - Desmarcar não apaga o anexo nem o registro da versão.
   - Apenas retira a evidência do PDF daquela versão.
3. A ordem pode ser alterada pelos botões ↑ e ↓ antes de salvar/finalizar.
4. O PDF passou a ter:
   - quadro-resumo das evidências incluídas;
   - um card detalhado por evidência;
   - título;
   - tipo;
   - descrição “O que comprova”;
   - nome do arquivo;
   - miniatura para imagens JPG/JPEG armazenadas no Supabase;
   - link externo, quando informado.
5. Links externos recebem área clicável no PDF gerado diretamente pelo sistema.
6. Arquivos privados do Supabase continuam privados.
   - O PDF mostra o nome do arquivo e informa que ele está disponível no histórico da versão no DataHub.
   - Não é gravado no PDF um link temporário do Supabase que expiraria depois.
7. Evidências antigas continuam compatíveis:
   - se não possuírem o campo incluir_relatorio, são consideradas incluídas;
   - se não possuírem ordem, mantêm a ordem em que já estavam salvas.
8. A validação de finalização exige ao menos uma evidência marcada para entrar no relatório.

Instalação
- Não há SQL novo nesta etapa.
- O armazenamento privado `pq-evidencias` já instalado continua sendo utilizado.
- Publique os arquivos no GitHub Pages e faça Ctrl + F5.

Arquivos funcionais alterados
- projetos.html
- js/projetos.js
- css/projetos.css

Teste recomendado
1. Abra um projeto com release.
2. Adicione 3 evidências.
3. Reordene para 02 → 01 → 03 usando ↑/↓.
4. Desmarque uma em “Incluir no relatório”.
5. Anexe uma imagem JPG/JPEG e confira a miniatura.
6. Informe um link externo em outra evidência.
7. Salve como rascunho e reabra: ordem e seleção devem permanecer.
8. Gere a prévia/PDF: somente as selecionadas devem aparecer, numeradas na ordem definida.

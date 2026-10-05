BI-Monday V25.46.45 — Evidências navegáveis e PDF clicável

Base: V25.46.44.

Problemas corrigidos
1. O botão “Abrir arquivo” das evidências passa a abrir o arquivo com URL assinada do Supabase.
2. PDFs são exibidos dentro de um visualizador modal, com opção “Abrir em nova guia”.
3. Imagens são exibidas no mesmo visualizador.
4. O Histórico de versões recebe o botão “Ver evidências”.
   - As evidências são buscadas diretamente em pq_projetos_edicoes.
   - Aceita evidencias em JSONB array e também versões antigas retornadas como texto JSON.
5. Cada arquivo anexado recebe um link estável do DataHub.
   - O link não expira.
   - Ao ser aberto, o DataHub gera uma nova URL assinada temporária no momento da consulta.
6. O PDF gerado passa a conter “Abrir PDF” / “Abrir evidência” como link clicável.
   - O arquivo privado continua privado.
   - O PDF aponta para o DataHub, não para uma signed URL temporária.
7. Nenhuma tabela, release, certificado, Reunião NQ ou regra de Projeto Qualidade foi alterada.

Instalação
- Não há SQL novo.
- Publique os arquivos desta pasta sobre a versão atual.
- Faça Ctrl + F5.

Teste
1. Abra Projeto Qualidade.
2. Abra uma versão com evidências.
3. Clique “Ver evidências” no Histórico.
4. Clique “Abrir PDF”.
5. Gere “Visualizar PDF”.
6. No PDF gerado, clique “Abrir PDF” na evidência.
7. O DataHub deve abrir e gerar o acesso autenticado ao anexo.

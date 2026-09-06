# Instalação do importador de projetos

Esta versão permite selecionar a planilha recebida do Ajure, conferir os dados e atualizar o banco sem usar a ação HTTP Premium do Power Automate.

## Ordem obrigatória

1. Confirme que abriu o projeto Supabase `nkjmgzyjjbepebzurowy` (`datahub-validadores`).
2. Execute `00_CRIAR_BANCO_PROJETOS_QUALIDADE.sql` no SQL Editor. Esse arquivo cria toda a estrutura e também inclui os campos do importador.
3. Abra ou crie a Edge Function `sincronizar-projetos-qualidade`.
4. Substitua o código pelo arquivo `supabase/functions/sincronizar-projetos-qualidade/index.ts` deste pacote.
5. Mantenha a verificação JWT da função ativada. O login, o banco e a função estão no mesmo projeto.
6. As variáveis seguintes são opcionais porque a função já usa esses valores como padrão:

   - `PQ_ALLOWED_DOMAINS`: `animaeducacao.com.br`
   - `PQ_ALLOWED_ORIGINS`: `https://qualidadesintechtica.github.io`
   - `PQ_ALLOWED_EMAILS`: opcional; lista separada por vírgulas quando somente pessoas específicas puderem importar.

7. Faça o deploy da função.
8. Envie os arquivos deste pacote para a raiz do repositório `BI-Monday`.
9. Aguarde o GitHub Pages publicar e faça `Ctrl+F5`.
10. Entre no BI e abra **Projetos da Qualidade > Importar Excel**.

## Segurança

- Não coloque `service_role`, senha ou segredo no HTML, JavaScript ou GitHub.
- A chave `SUPABASE_PUBLISHABLE_KEY` do site é pública por definição; ela não substitui as políticas do banco.
- A função aceita somente sessões válidas do BI e e-mails do domínio configurado.
- O arquivo é lido no navegador. O Excel original não é enviado nem publicado; somente os campos mapeados seguem para a função.

## Teste inicial

Use primeiro uma cópia da planilha. A tela deve mostrar:

- nome da aba encontrada;
- quantidade de projetos;
- quantidade de tarefas e ações;
- linhas vazias descartadas;
- linhas com dados inválidos;
- uma prévia das primeiras linhas.

Depois de confirmar a importação, confira `public.pq_importacoes`. A linha mais recente deve ter `status = concluida`, o hash do arquivo e o e-mail do usuário.

## Se aparecer “Esta mesma planilha já foi importada”

O bloqueio está funcionando. Se os dados mudaram, use o novo arquivo recebido. Não altere o Excel apenas para contornar a proteção.

## Se aparecer “Sessão inválida ou sem permissão”

Confira `PQ_ALLOWED_DOMAINS`, mantenha a verificação JWT ativada e depois saia e entre novamente no BI.

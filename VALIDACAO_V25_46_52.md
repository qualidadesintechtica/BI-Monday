# Validação V25.46.52

Verificação realizada em ambiente isolado, com dados de exemplo. A versão ainda precisa ser instalada no Supabase e publicada no site do usuário.

## Banco

O SQL foi executado em PostgreSQL via PGlite, incluindo a reaplicação do arquivo. Foram verificados:

- Criação atômica de tarefa e histórico.
- Bloqueio de conclusão com passos pendentes.
- Controle de versão: edição desatualizada é recusada e não grava histórico parcial.
- Conclusão, arquivamento, restauração e comentários.
- Recusa de etapas com identificadores repetidos e de vínculos inválidos.
- Recusa de escrita direta nas tabelas pelo usuário autenticado.
- Bloqueio de acesso anônimo e de sessão fora do domínio permitido.

## Interface

Fluxos executados em Chromium com a interface real do BI e o banco isolado conectado por um adaptador de teste:

- Abertura da aba junto ao dashboard.
- Criação e salvamento com responsável, prazo, passo e vínculo com material.
- Contagem de atraso e atenção; sinalização no menu.
- Conclusão bloqueada com passo pendente; conclusão depois de marcar o passo.
- Comentários e consulta do histórico.
- Arquivamento e restauração.
- Itens com a mesma UA e nomes preservados como registros distintos pelo ID.
- Alternância de quadro e lista; exportação CSV.
- Criação de tarefa diretamente pela Operação, Ajustes e Certificados.
- Layout do formulário em tela móvel.
- Abertura de projeto por ID e criação de tarefa associada ao projeto.

Não houve erros de JavaScript nos fluxos de interface testados. Os arquivos JavaScript passaram na verificação de sintaxe e as referências locais de scripts e estilos foram conferidas.

## Preservação da base

Os arquivos de `supabase/`, `INSTALAR_PELO_PAINEL/` e todos os SQLs anteriores são idênticos aos da V25.46.51. A alteração no módulo Certificados acrescenta a ação de criar tarefa de planejamento. A lógica de envio e processamento da fila permanece a mesma.

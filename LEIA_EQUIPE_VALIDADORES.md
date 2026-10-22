# Equipe · Banco de Validadores — V25.46.70

## Instalação

1. Use o Supabase e o repositório do **BI DataHub**, cujo site contém `js/dashboard.js` e `projetos.html`.
2. No SQL Editor, abra uma consulta nova, cole **todo** `docs/26_BANCO_VALIDADORES_EQUIPE.sql` e execute. O resultado deve informar **V25.46.70 instalada**.
3. Publique o conteúdo completo da pasta **BI-Monday** na raiz do site atual do BI. Inclua os novos `js/equipe-core.js`, `js/equipe.js` e `css/equipe.css`.
4. Pressione **Ctrl + F5**. O menu lateral deve mostrar **v25.46.70 · Banco de Validadores**.
5. Entre em **Equipe > Importar Excel**, escolha **Cadastro completo e vínculos** e selecione `Banco_de_Validadores.xlsx`. A aba **Banco** será escolhida automaticamente; a aba `etapas` contém apenas instruções.
6. Confira a prévia e clique em **Confirmar importação**. Depois abra **Cadastro e vínculos**.

Para esta atualização, basta instalar o SQL 26. Nenhuma função precisa ser publicada. As instruções das versões anteriores ficam disponíveis como histórico em COMECE_AQUI.md.

## Cadastro, pesquisa e filtros

A estrutura segue as doze colunas do Excel e acrescenta o tempo de desligamento. A identificação do docente usa o e-mail institucional. Cada vínculo corresponde à combinação de **e-mail, IES, UC e semestre**. A IES e a titulação são preservadas por vínculo, inclusive quando diferem entre linhas do mesmo docente.

A planilha fornecida contém **139 linhas de dados**, **69 docentes** e **8 linhas duplicadas idênticas**. A importação resulta em **131 vínculos únicos**. As duplicatas estão nas linhas **34, 39, 78, 96, 102, 110, 120 e 122**; a prévia informa essas linhas. Elas pertencem ao semestre 2026.2. A distribuição única é 31 vínculos em 2026.1 e 100 em 2026.2.

A pesquisa aceita nome, e-mail, UC, formação e os demais textos do registro, sem diferenciar acentos ou maiúsculas. Os filtros de IES, vínculo, formação, titulação, semestre, UC e avaliação podem ser combinados. **Limpar filtros** restaura o banco inteiro. A tabela exibe 25 linhas por página. Os filtros globais do BI são recolhidos nessa aba para dar lugar aos filtros do banco.

Os contadores mostram docentes e vínculos distintos no filtro atual. Uma pessoa com vínculo ativo em uma IES e desligamento em outra poderá aparecer nos dois contadores de situação.

Há um erro **#N/A** de formação no arquivo de origem. Ele permanece visível como texto na importação; o sistema não inventa a formação ausente. Corrigir esse campo e reimportar atualiza o mesmo vínculo.

## Avaliação da Atuação na Validação

A área usa a coluna **AVALIAÇÃO** e os **COMENTÁRIOS** do banco, por docente, IES, UC e semestre. Essas duas colunas estão vazias no anexo. Por isso, o banco começa com **Sem avaliação**; não há nota zero presumida, conversão de conceitos ou média entre escalas diferentes.

Use **Registrar / editar** para informar a avaliação recebida e os comentários. A nota ou o conceito é preservado como registrado, inclusive zero. As alterações ficam no histórico protegido no Supabase, com autor, data, valores anteriores e valores novos. Se outra pessoa tiver alterado o registro, a edição é recusada até atualizar a aba.

Uma importação de cadastro com AVALIAÇÃO ou COMENTÁRIOS vazios preserva os valores já salvos. Para limpar deliberadamente uma avaliação, use o editor da própria área e salve os campos vazios.

## Atualizar desligamentos por Excel

1. Abra **Equipe > Importar Excel** e escolha **Somente datas de desligamento**.
2. O Excel deve ter **E-MAIL INSTITUCIONAL** e **DATA DE DESLIGAMENTO**. Aceita datas reais do Excel, `DD/MM/AAAA` ou `AAAA-MM-DD`.
3. Opcionalmente inclua **IES DE VINCULO** para restringir a atualização àquela instituição. Sem essa coluna ou com IES vazia, a data será aplicada a todos os vínculos cadastrados daquele e-mail.
4. Confira a prévia e confirme a importação. Se houver e-mail/IES desconhecido, data inválida ou datas conflitantes para o mesmo e-mail, o lote não será salvo até a correção.

Datas vazias são ignoradas. Este modo atualiza a data e a situação do vínculo; os demais campos são preservados. A reimportação do cadastro antigo, com desligamento vazio, também não apaga um desligamento salvo.

O tempo de desligamento é a quantidade de **dias corridos entre a data cadastrada e hoje**, considerando a data de Brasília. No próprio dia, mostra zero dias. Vínculo desligado sem data mostra “—”. Data futura mostra **Desligamento agendado**, com tempo ainda não iniciado. Os dias e a situação se atualizam ao retornar à tela e a cada minuto enquanto a aba estiver aberta.

## Acesso e verificação

A leitura e as operações de escrita exigem sessão institucional `@animaeducacao.com.br`, seguindo o acesso do BI. Escritas ocorrem por funções autenticadas; tabelas e histórico não recebem escrita direta dos usuários. A nova planilha de validadores e seus registros não são incluídos no pacote para publicação. O banco é carregado pela importação autenticada.

Verificação local: importação dos dados reais, filtros e paginação, reimportação sem duplicação, datas inválidas e futuras, preservação de campos, nota zero, conflitos de edição, restrição por IES, reversão integral em caso de erro e bloqueio de acesso anônimo/externo. O SQL foi instalado duas vezes em banco de teste PostgreSQL. Os fluxos da interface foram verificados em simulação DOM; a conferência visual em navegador ficou indisponível nesta sessão. O SQL e a importação não foram executados no ambiente de produção.

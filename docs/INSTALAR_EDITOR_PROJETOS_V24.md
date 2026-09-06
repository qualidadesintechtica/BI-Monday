# Instalar o editor e os relatórios dos Projetos da Qualidade

Esta versão usa o mesmo projeto Supabase do login e do importador:

```text
nkjmgzyjjbepebzurowy (datahub-validadores)
```

Os dados recebidos do Ajure ficam nas tabelas `pq_projetos` e `pq_tarefas` e
continuam somente leitura. Os textos complementares são gravados em
`pq_projetos_edicoes`. Cada salvamento cria uma nova linha e uma nova versão.

## 1. Criar a estrutura do editor

1. Abra o projeto `datahub-validadores` no Supabase.
2. Entre em **SQL Editor**.
3. Clique em **New query**.
4. Copie todo o conteúdo de `docs/03_CRIAR_EDITOR_RELATORIOS_PQ.sql`.
5. Cole no editor e clique em **Run**.
6. O resultado final deve mostrar:

```text
tabela_edicoes             | funcao_salvar
pq_projetos_edicoes        | pq_salvar_edicao(...)
```

O script não apaga nem altera os projetos já importados.

## 2. Publicar os arquivos no GitHub Pages

Envie para a raiz do repositório `qualidadesintechtica/BI-Monday` todos os
arquivos e pastas do pacote V24, preservando a estrutura. Os principais novos
arquivos são:

```text
projetos.html
css/projetos.css
js/projetos.js
docs/03_CRIAR_EDITOR_RELATORIOS_PQ.sql
```

Também substitua `index.html`, `importar.html`, `js/config.js`, `README.txt` e
`VERSAO.txt`, pois eles contêm os novos links e o identificador da versão.

## 3. Testar

1. Aguarde o GitHub Pages terminar a publicação.
2. Entre no DataHub com a conta corporativa.
3. Abra **Projetos da Qualidade > Editar e gerar relatório**.
4. Escolha um projeto.
5. Confira o quadro **Conteúdo original**. Ele não possui campos editáveis.
6. Preencha ao menos um campo e clique em **Salvar nova versão**.
7. Confirme que a versão 1 aparece no histórico.
8. Altere um texto e salve novamente. A versão 1 deve permanecer, e a versão 2
   deve aparecer acima dela.

## 4. Finalizar e gerar PDF

Para finalizar, preencha:

- contexto e objetivo;
- resultados esperados;
- resultados alcançados;
- impacto gerado;
- ao menos uma evidência com título e link iniciado por `http://` ou `https://`.

Clique em **Finalizar e gerar PDF**. Na janela de impressão do navegador,
escolha **Salvar como PDF** como destino e confirme.

## Segurança e histórico

- Nenhuma chave administrativa fica no navegador.
- O usuário precisa estar autenticado no Supabase.
- Apenas contas `@animaeducacao.com.br` podem ler e salvar.
- O navegador não recebe permissão direta para atualizar ou excluir versões.
- O salvamento ocorre pela função segura `pq_salvar_edicao`.
- Cada versão guarda uma fotografia do projeto e das tarefas originais daquele
  momento, além do autor e da data.

V25.46.47 — Evidências sem travamento

Base usada: V25.46.44 (última versão estável antes da alteração de evidências).

Causa confirmada do travamento:
- projetos-evidencias-fix.js observava mudanças em #reportDocument;
- dentro do callback, link.textContent era reatribuído sempre;
- essa própria alteração gerava uma nova mutação;
- o MutationObserver voltava a executar sem parar;
- o navegador consumia CPU até mostrar “Esta página não está respondendo”.

Correção:
- alterações do link só são feitas quando o valor realmente mudou;
- observers são limitados a uma atualização por frame;
- a funcionalidade de abrir PDF/evidência foi mantida;
- não há alteração de banco de dados;
- NÃO execute o SQL da V25.46.46 e NÃO implante a Edge Function da V25.46.46.

Instalação:
1. Publique esta pasta por cima da versão atual.
2. Ctrl+F5.
3. Teste primeiro projetos.html sem abrir evidências.
4. Depois teste Histórico -> Ver evidências -> Abrir PDF.

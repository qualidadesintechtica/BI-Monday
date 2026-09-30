-- Carga inicial deduplicada da Base Oficial de Revisores de UA
-- Fonte: Formulário - Acompanhamento NQ x Revisor_com e-mail.xlsx
-- 44 linhas de dados; 43 vínculos únicos Revisor + UC.

INSERT INTO public.revisores_ua
  (nq_responsavel, docente_revisor, email, uc, ativo)
VALUES
  ('Marcilene Pereira da Silva', 'Amandio Luis Barbosa Furtado', 'amandio.furtado@ulife.com.br', 'GESTÃO AEROPORTUÁRIA E MARKETING NA AVIAÇÃO', true),
  ('Marcilene Pereira da Silva', 'Amandio Luis Barbosa Furtado', 'amandio.furtado@ulife.com.br', 'LEGISLAÇÃO E SISTEMA DE SEGURANÇA OPERACIONAL', true),
  ('Marcilene Pereira da Silva', 'Amandio Luis Barbosa Furtado', 'amandio.furtado@ulife.com.br', 'SAÚDE, EMERGÊNCIA E SOBREVIVÊNCIA NA AVIAÇÃO', true),
  ('Juarez de Quadros Barbosa Junior', 'Ana Alice Miranda Duarte', 'ana.alice@ulife.com.br', 'PROJETOS COMPLEMENTARES DE INTERIORES', true),
  ('Carlos Pereira Martins', 'Bruno Perez Felix', 'bruno.felix@ulife.com.br', 'FISIOTERAPIA EM TRAUMATO-ORTOPEDIA FUNCIONAL E ESPORTIVA', true),
  ('Samantha Orquelita de Oliveira Borges', 'Caroline Mendes Ferreira', 'caroline.mendes@ulife.com.br', 'BIOMEDICINA ESTÉTICA E BEM-ESTAR', true),
  ('Juarez de Quadros Barbosa Junior', 'Cristiane Ribeiro Pereira Bastos', 'cristiane.r.bastos@ulife.com.br', 'EDUCAÇÃO MATEMÁTICA: ENSINAR, APRENDER E PRÁTICAR', true),
  ('Marcilene Pereira da Silva', 'Demetrius De Castro Do Amaral', 'demetrius.amaral@ulife.com.br', 'MODELAGEM DE SOFTWARE', true),
  ('Marcilene Pereira da Silva', 'Erivelton Xavier De Lima', 'erivelton.lima@ulife.com.br', 'SISTEMAS COMPUTACIONAIS E SEGURANÇA', true),
  ('Alexia Soares Montingelli Lopes', 'Fabio da Silva Santos', 'fabio.s.santos@ulife.com.br', 'SEGURANÇA, POLÍCIA E ESTADO DE DIREITO', true),
  ('Juarez de Quadros Barbosa Junior', 'Fernanda Mendes De Vuono Santos', 'fernanda.vuono@ulife.com.br', 'LABORATÓRIO EXPERIMENTAL DE DESIGN', true),
  ('Juarez de Quadros Barbosa Junior', 'Fernanda Mendes De Vuono Santos', 'fernanda.vuono@ulife.com.br', 'IMAGEM E IDENTIDADE DE MARCA', true),
  ('Juarez de Quadros Barbosa Junior', 'Flavia Elaine Aliotti Rodrigues Nogueira', 'flavia.aliotti@ulife.com.br', 'PROJETOS COMPLEMENTARES DE INTERIORES', true),
  ('Giuliano Pereira de Barros', 'Francisco Jose Rodrigues Da Silva Junior', 'francisco.j.junior@ulife.com.br', 'ALGORITMOS E PROGRAMAÇÃO', true),
  ('Carlos Pereira Martins', 'Gabriela Rezende Yanagihara', 'gabriela.yanagihara@ulife.com.br', 'FISIOTERAPIA NA SAÚDE DA MULHER E NA SAÚDE DO IDOSO', true),
  ('Samantha Orquelita de Oliveira Borges', 'Gilmara Camargo de Freitas', 'gilmara.freitas@ulife.com.br', 'COSMETOLOGIA APLICADA', true),
  ('Juarez de Quadros Barbosa Junior', 'Giovanni Gropello Sandoval', 'giovanni.sandoval@ulife.com.br', 'COZINHA INTERNACIONAL', true),
  ('Juarez de Quadros Barbosa Junior', 'Giovanni Gropello Sandoval', 'giovanni.sandoval@ulife.com.br', 'FUNDAMENTOS DA COZINHA PROFISSIONAL', true),
  ('Juarez de Quadros Barbosa Junior', 'Giovanni Gropello Sandoval', 'giovanni.sandoval@ulife.com.br', 'PANIFICAÇÃO E CONFEITARIA', true),
  ('Samantha Orquelita de Oliveira Borges', 'Ipojucan Pereira Da Silva', 'ipojucan.silva@ulife.com.br', 'HISTÓRIA DAS ARTES CÊNICAS', true),
  ('Giuliano Pereira de Barros', 'Itacio Queiroz De Mello Padilha', 'itacio.padilha@ulife.com.br', 'ANÁLISES CITOLÓGICAS E BIOTECNOLOGIA', true),
  ('Samantha Orquelita de Oliveira Borges', 'Luciana Freire Murgel', 'luciana.murgel@ulife.com.br', 'INFLUÊNCIA E PRODUÇÃO DE CONTEÚDO', true),
  ('Samantha Orquelita de Oliveira Borges', 'Luciana Freire Murgel', 'luciana.murgel@ulife.com.br', 'LINGUAGENS E RELAÇÕES ESTÉTICAS', true),
  ('Carlos Pereira Martins', 'Marcella De Avelar Sampaio', 'marcella.lagden@ulife.com.br', 'ESTRUTURA, CINÉTICA E DINÂMICA DOS FARMÁCOS', true),
  ('Carlos Pereira Martins', 'Marcella De Avelar Sampaio', 'marcella.lagden@ulife.com.br', 'GESTÃO DE SERVIÇOS FARMACÊUTICOS', true),
  ('Giuliano Pereira de Barros', 'Marcus Andre Ferreira As', 'marcus.sa@ulife.com.br', 'ZOOTECNIA DE RUMINANTES', true),
  ('Samantha Orquelita de Oliveira Borges', 'Mayara Kelly Martins De Medeiros Dias', 'mayara.kelly@ulife.com.br', 'TÉCNICAS DIETÉTICAS E GASTRONOMIA', true),
  ('Marcilene Pereira da Silva', 'Moises Conde Silva De Oliveira', 'moises.conde@ulife.com.br', 'GESTÃO ESTRATÉGICA DE FINANÇAS', true),
  ('Carlos Pereira Martins', 'Patricia Campos Kickinger', 'patricia.kickinger@ulife.com.br', 'VOZ', true),
  ('Giuliano Pereira de Barros', 'Priscila Borges de Morais', 'priscila.morais@ulife.com.br', 'AMBIENTES COMPUTACIONAIS E CONECTIVIDADE', true),
  ('Giuliano Pereira de Barros', 'Priscila Borges de Morais', 'priscila.morais@ulife.com.br', 'INTELIGÊNCIA ARTIFICIAL', true),
  ('Carlos Pereira Martins', 'Raquel Senna Telhado', 'raquel.telhado@ulife.com.br', 'NUTRIÇÃO EM SAÚDE COLETIVA', true),
  ('Carlos Pereira Martins', 'Ricardo Jose Brandao Velloso', 'ricardo.velloso@ulife.com.br', 'EDUCAÇÃO FÍSICA NA INFÂNCIA E NA ADOLESCÊNCIA', true),
  ('Juarez de Quadros Barbosa Junior', 'Rosanne Azevedo De Albuquerque', 'rosanne.albuquerque@ulife.com.br', 'TÊXTEIS E SUPERFÍCIES', true),
  ('Juarez de Quadros Barbosa Junior', 'SERGIO LUIS IGNACIO DE OLIVEIRA', 'prof.sergioignacio@ulife.com.br', 'EMPREENDEDORISMO E INOVAÇÃO EM HOSPITALIDADE', true),
  ('Alexia Soares Montingelli Lopes', 'Sergio Sampaio Spinola', 'sergio.spinola@ulife.com.br', 'BANCO DE DADOS', true),
  ('Carlos Pereira Martins', 'Stefane Maria De Lima Campos', 'stefane.campos@ulife.com.br', 'CONHECIMENTOS MORFOFUNCIONAIS DE CABEÇA E PESCOÇO', true),
  ('Marcilene Pereira da Silva', 'Tania Barbosa Tomaz', 'tania.tomaz@ulife.com.br', 'ANÁLISE DE DADOS E BIG DATA', true),
  ('Marcilene Pereira da Silva', 'Tatiana de Andrade Spinola', 'tatiana.spinola@ulife.com.br', 'ADMINISTRAÇÃO E INTEGRAÇÃO DE OPERAÇÕES E QUALIDADE', true),
  ('Alexia Soares Montingelli Lopes', 'Tito Livio Cavalcanti Ramalho', 'tito.ramalho@ulife.com.br', 'COZINHA INTERNACIONAL', true),
  ('Alexia Soares Montingelli Lopes', 'Tito Livio Cavalcanti Ramalho', 'tito.ramalho@ulife.com.br', 'PANIFICAÇÃO E CONFEITARIA', true),
  ('Alexia Soares Montingelli Lopes', 'Vicente Celeste De Oliveira Junior', 'vicente.celeste@ulife.com.br', 'EXTENSÃO UNIVERSITÁRIA EM RELAÇÕES DE CONSUMO', true),
  ('Marcilene Pereira da Silva', 'Vinicius Carlos De Oliveira', 'vinicius.c.oliveira@ulife.com.br', 'TREINAMENTO ESPORTIVO E MUSCULAÇÃO', true)
ON CONFLICT (
  (lower(trim(docente_revisor))),
  (lower(trim(uc)))
)
DO UPDATE SET
  nq_responsavel = EXCLUDED.nq_responsavel,
  email = EXCLUDED.email,
  ativo = EXCLUDED.ativo,
  atualizado_em = NOW();

-- Conferência
SELECT
  COUNT(*) AS total_vinculos,
  COUNT(DISTINCT lower(trim(docente_revisor))) AS total_revisores,
  COUNT(DISTINCT lower(trim(uc))) AS total_ucs
FROM public.revisores_ua;

import fs from 'node:fs';
import path from 'node:path';

const basePath = 'C:/Users/Henrique/.gemini/antigravity/brain/d46cc375-cbd8-4413-8cee-f4436fed7042/.system_generated/steps';

function parseMcpResult(stepNum) {
  const content = fs.readFileSync(path.join(basePath, String(stepNum), 'output.txt'), 'utf8');
  let text = content;
  try {
    const outer = JSON.parse(content);
    if (outer.result) text = outer.result;
  } catch (e) {}
  const jsonMatch = text.match(/<untrusted-data-([a-zA-Z0-9_-]+)>\s*(\[[\s\S]*?\]|\{[\s\S]*?\})\s*<\/untrusted-data-\1>/);
  if (!jsonMatch) {
    throw new Error(`Could not find untrusted data boundary in step ${stepNum}`);
  }
  return JSON.parse(jsonMatch[2]);
}

console.log('Loading extracted Lojão data...');

const s831 = parseMcpResult(831)[0];
const s833 = parseMcpResult(833)[0];
const s835 = parseMcpResult(835)[0];
const s837 = parseMcpResult(837)[0];
const s839 = parseMcpResult(839)[0];
const s895 = parseMcpResult(895)[0].json_build_object;
const funcs = parseMcpResult(909);

console.log('All data loaded successfully. Generating SQL...');

let sql = `-- =====================================================================
-- LOJAO DOS MARMORES - MIGRACAO COMPLETA CONSOLIDADA PARA A VPS
-- Importa estrutura, funcoes de calculo v3, tabelas e todos os dados historicos
-- =====================================================================

BEGIN;

-- 1. Usuarios de suporte em auth.users para integridade relacional
DO $$
BEGIN
  INSERT INTO auth.users (id, instance_id, email, aud, role, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  VALUES 
    ('a8bf5fe7-11bc-422e-a513-56ebf1bffae2', '00000000-0000-0000-0000-000000000000', 'lojaodomarmore@gmail.com', 'authenticated', 'authenticated', now(), now(), '{"provider":"email","providers":["email"]}', '{"nome":"Clóvis"}'),
    ('85c6a908-3967-40b1-8b06-9828e09200aa', '00000000-0000-0000-0000-000000000000', 'zukamarmore@gmail.com', 'authenticated', 'authenticated', now(), now(), '{"provider":"email","providers":["email"]}', '{"nome":"clovis"}')
  ON CONFLICT (id) DO NOTHING;
END $$;

-- 2. DDL das tabelas do Lojao (sem conflito com DeskcommCRM)
CREATE TABLE IF NOT EXISTS public.lojas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  endereco TEXT,
  telefone TEXT,
  email TEXT,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'vendedor',
  loja_id UUID REFERENCES public.lojas(id),
  permissions JSONB DEFAULT '{}'::jsonb,
  telefone TEXT,
  status TEXT DEFAULT 'ativo',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.clientes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  telefone TEXT NOT NULL,
  endereco TEXT,
  cpf_cnpj TEXT,
  email TEXT,
  telefone_last8 TEXT,
  data_nascimento DATE,
  loja_id UUID REFERENCES public.lojas(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.produtos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL,
  medidas_padrao TEXT,
  unidade_venda TEXT NOT NULL,
  preco_unitario DECIMAL(10,2) NOT NULL DEFAULT 0,
  imagem_url TEXT,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.produto_variacoes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  produto_id UUID REFERENCES public.produtos(id) ON DELETE CASCADE NOT NULL,
  variacao TEXT NOT NULL,
  preco_venda DECIMAL(10,2) NOT NULL DEFAULT 0,
  imagem_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.orcamentos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  numero_orcamento TEXT UNIQUE NOT NULL,
  cliente_id UUID REFERENCES public.clientes(id) NOT NULL,
  user_id UUID,
  forma_pagamento TEXT,
  observacoes TEXT,
  valor_total DECIMAL(10,2) DEFAULT 0,
  status TEXT DEFAULT 'pendente',
  data_validade DATE,
  loja_id UUID REFERENCES public.lojas(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.itens_orcamento (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  orcamento_id UUID REFERENCES public.orcamentos(id) ON DELETE CASCADE NOT NULL,
  produto_id UUID REFERENCES public.produtos(id) NOT NULL,
  descricao TEXT NOT NULL,
  quantidade DECIMAL(10,2) NOT NULL DEFAULT 1,
  preco_unitario DECIMAL(10,2) NOT NULL DEFAULT 0,
  preco_total DECIMAL(10,2) NOT NULL DEFAULT 0,
  medidas TEXT,
  variacao TEXT,
  memoria_calculo JSONB,
  detalhes_calculo JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.pedidos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  numero_pedido TEXT UNIQUE NOT NULL,
  cliente_id UUID REFERENCES public.clientes(id) NOT NULL,
  orcamento_id UUID REFERENCES public.orcamentos(id),
  user_id UUID,
  status TEXT DEFAULT 'aguardando_producao',
  data_entrega_prevista DATE,
  data_entrega DATE,
  valor_total DECIMAL(10,2) NOT NULL DEFAULT 0,
  pago BOOLEAN DEFAULT false,
  forma_pagamento TEXT,
  parcelas INTEGER,
  responsavel_producao TEXT,
  observacoes TEXT,
  loja_id UUID REFERENCES public.lojas(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.itens_pedido (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pedido_id UUID REFERENCES public.pedidos(id) ON DELETE CASCADE NOT NULL,
  produto_id UUID REFERENCES public.produtos(id) NOT NULL,
  descricao TEXT NOT NULL,
  quantidade DECIMAL(10,2) NOT NULL DEFAULT 1,
  preco_unitario DECIMAL(10,2) NOT NULL DEFAULT 0,
  preco_total DECIMAL(10,2) NOT NULL DEFAULT 0,
  medidas TEXT,
  variacao TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.promocoes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  produto_id UUID REFERENCES public.produtos(id) NOT NULL,
  variacao TEXT,
  preco_original DECIMAL(10,2) NOT NULL,
  preco_promocional DECIMAL(10,2) NOT NULL,
  data_inicio TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  data_fim TIMESTAMP WITH TIME ZONE,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.promocoes_envios (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  promocao_id UUID REFERENCES public.promocoes(id) ON DELETE CASCADE NOT NULL,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE CASCADE NOT NULL,
  enviado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  canal TEXT DEFAULT 'whatsapp'
);

CREATE TABLE IF NOT EXISTS public.orcamento_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  payload JSONB NOT NULL,
  status TEXT DEFAULT 'pendente',
  resposta JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.aniversarios_enviados (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE CASCADE NOT NULL,
  ano INTEGER NOT NULL,
  enviado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.aniversarios_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE CASCADE NOT NULL,
  data_envio TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status TEXT
);

CREATE TABLE IF NOT EXISTS public.catalogo_ambientes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  descricao TEXT,
  imagem_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.fornecedores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  cnpj TEXT,
  telefone TEXT,
  email TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.pagamentos_fornecedores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  fornecedor_id UUID REFERENCES public.fornecedores(id),
  valor DECIMAL(10,2) NOT NULL,
  data_pagamento DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.relatorios (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome_relatorio TEXT,
  periodo_dias INTEGER,
  data_geracao TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  user_id UUID,
  total_vendas DECIMAL(10,2),
  total_pedidos INTEGER,
  total_clientes INTEGER,
  total_produtos INTEGER,
  total_orcamentos INTEGER,
  total_fornecedores INTEGER,
  ticket_medio_pedidos DECIMAL(10,2),
  ticket_medio_orcamentos DECIMAL(10,2),
  total_pago_fornecedores DECIMAL(10,2),
  pedidos_aguardando_producao INTEGER,
  pedidos_em_producao INTEGER,
  pedidos_aguardando_retirada INTEGER,
  pedidos_finalizado INTEGER,
  pedidos_entregue INTEGER,
  orcamentos_pendentes INTEGER,
  orcamentos_aprovados INTEGER,
  orcamentos_rejeitados INTEGER
);

CREATE TABLE IF NOT EXISTS public.historico_relatorios (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  relatorio_id UUID REFERENCES public.relatorios(id) ON DELETE CASCADE,
  dados JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.configuracoes_relatorios (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  chave TEXT UNIQUE NOT NULL,
  valor JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS public.game_progress (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  nivel INTEGER DEFAULT 1,
  pontos INTEGER DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.lojao_precos_venda (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  produto_id UUID REFERENCES public.produtos(id) ON DELETE CASCADE NOT NULL,
  variacao TEXT NOT NULL,
  preco_tabela_centavos BIGINT,
  preco_mediana_orcamentos_centavos BIGINT,
  preco_min_orcamentos_centavos BIGINT,
  preco_max_orcamentos_centavos BIGINT,
  preco_venda_centavos BIGINT,
  amostra_orcamentos INTEGER DEFAULT 0,
  ultimo_orcamento_em TIMESTAMP WITH TIME ZONE,
  origem TEXT,
  status TEXT DEFAULT 'rascunho',
  versao INTEGER DEFAULT 1,
  confirmado_por TEXT,
  confirmado_em TIMESTAMP WITH TIME ZONE,
  observacoes TEXT,
  UNIQUE(produto_id, variacao)
);

CREATE TABLE IF NOT EXISTS public.lojao_regras_calculo (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  variacao TEXT UNIQUE NOT NULL,
  unidade TEXT NOT NULL,
  usa_area BOOLEAN NOT NULL DEFAULT true,
  multiplicador NUMERIC NOT NULL DEFAULT 1,
  medida_minima_m2 NUMERIC NOT NULL DEFAULT 0,
  arredondamento TEXT NOT NULL DEFAULT 'arredonda_meio_baixo',
  ativo BOOLEAN NOT NULL DEFAULT true,
  observacoes TEXT,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.lojao_regras_extras (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo TEXT UNIQUE NOT NULL,
  nome TEXT NOT NULL,
  unidade TEXT NOT NULL,
  preco_centavos BIGINT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  observacoes TEXT,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.lojao_parametros_v3 (
  chave TEXT PRIMARY KEY,
  valor NUMERIC NOT NULL,
  unidade TEXT,
  descricao TEXT,
  categoria TEXT,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.lojao_orcamento_solicitacoes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  token_aprovacao UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  idempotency_key TEXT UNIQUE,
  cliente_nome TEXT,
  cliente_telefone TEXT,
  canal TEXT,
  conversa_id TEXT,
  payload JSONB NOT NULL,
  resultado JSONB,
  modo TEXT DEFAULT 'producao',
  status TEXT DEFAULT 'rascunho',
  total_centavos BIGINT DEFAULT 0,
  ajuste_centavos BIGINT DEFAULT 0,
  total_final_centavos BIGINT DEFAULT 0,
  observacoes TEXT,
  aprovado_por TEXT,
  aprovado_em TIMESTAMP WITH TIME ZONE,
  expira_em TIMESTAMP WITH TIME ZONE DEFAULT (now() + interval '7 days'),
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  lead_id TEXT,
  rascunho_criado_em TIMESTAMP WITH TIME ZONE,
  rascunho_id TEXT,
  orcamento_id UUID REFERENCES public.orcamentos(id)
);

CREATE TABLE IF NOT EXISTS public.lojao_api_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  escopo TEXT NOT NULL DEFAULT 'agente',
  ativo BOOLEAN DEFAULT true,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ultimo_uso_em TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS public.lojao_crm_token (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  token TEXT NOT NULL,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ativo BOOLEAN DEFAULT true
);

-- Indices recomendados
CREATE INDEX IF NOT EXISTS idx_clientes_telefone_last8 ON public.clientes(telefone_last8);
CREATE INDEX IF NOT EXISTS idx_orcamentos_cliente_id ON public.orcamentos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_itens_orcamento_orcamento_id ON public.itens_orcamento(orcamento_id);
CREATE INDEX IF NOT EXISTS idx_produto_variacoes_produto_id ON public.produto_variacoes(produto_id);
CREATE INDEX IF NOT EXISTS idx_lojao_precos_venda_prod_var ON public.lojao_precos_venda(produto_id, variacao);
CREATE INDEX IF NOT EXISTS idx_lojao_orcamento_solicitacoes_lead ON public.lojao_orcamento_solicitacoes(lead_id);
\n`;

// 3. Add all functions
sql += `-- =====================================================================\n-- 3. FUNCOES E MOTOR DETERMINISTICO (31 funcoes)\n-- =====================================================================\n\n`;

for (const f of funcs) {
  sql += `${f.def};\n\n`;
}

// 4. Add all views
sql += `-- =====================================================================\n-- 4. VIEWS ANALITICAS E OPERACIONAIS DO LOJAO\n-- =====================================================================\n\n`;

const views = [
  { name: 'vw_lojao_catalogo', def: `CREATE OR REPLACE VIEW public.vw_lojao_catalogo AS
 SELECT id AS produto_id,
    nome AS produto,
    tipo,
    ( SELECT array_agg(v.variacao ORDER BY v.variacao) AS array_agg
           FROM lojao_precos_venda v
          WHERE ((v.produto_id = p.id) AND (v.status <> 'inativo'::text) AND (v.variacao IN ( SELECT rc.variacao
                   FROM lojao_regras_calculo rc
                  WHERE rc.ativo)))) AS variacoes,
    ( SELECT (count(*) > 0)
           FROM lojao_precos_venda v
          WHERE ((v.produto_id = p.id) AND (v.status = 'confirmado'::text))) AS tem_preco_confirmado
   FROM produtos p
  WHERE ((tipo = ANY (ARRAY['granito'::text, 'marmore'::text, 'silestone'::text])) AND (unidade_venda = 'm2'::text) AND (ativo = true));` },
  { name: 'vw_lojao_matriz_precos', def: `CREATE OR REPLACE VIEW public.vw_lojao_matriz_precos AS
 SELECT m.id,
    m.produto_id,
    p.nome AS produto,
    p.tipo,
    p.ativo AS produto_ativo,
    m.variacao,
    m.preco_tabela_centavos,
    m.preco_mediana_orcamentos_centavos,
    m.preco_min_orcamentos_centavos,
    m.preco_max_orcamentos_centavos,
    m.preco_venda_centavos,
    m.amostra_orcamentos,
    m.ultimo_orcamento_em,
    m.origem,
    m.status,
    m.versao,
    m.confirmado_por,
    m.confirmado_em,
    m.observacoes
   FROM (lojao_precos_venda m
     JOIN produtos p ON ((p.id = m.produto_id)));` },
  { name: 'vw_lojao_orcamentos_pendentes', def: `CREATE OR REPLACE VIEW public.vw_lojao_orcamentos_pendentes AS
 SELECT id,
    token_aprovacao,
    cliente_nome,
    cliente_telefone,
    canal,
    conversa_id,
    status,
    modo,
    total_centavos,
    ajuste_centavos,
    total_final_centavos,
    (resultado ->> 'status'::text) AS status_calculo,
    (resultado -> 'pendencias'::text) AS pendencias,
    criado_em,
    atualizado_em,
    aprovado_em
   FROM lojao_orcamento_solicitacoes
  WHERE (status = 'rascunho'::text)
  ORDER BY criado_em DESC;` },
  { name: 'vw_promocoes_ativas', def: `CREATE OR REPLACE VIEW public.vw_promocoes_ativas AS
 SELECT p.id AS promocao_id,
    p.produto_id,
    pr.nome AS produto_nome,
    pr.unidade_venda,
    p.preco_original,
    p.preco_promocional,
    p.data_inicio,
    p.data_fim
   FROM (promocoes p
     JOIN produtos pr ON ((pr.id = p.produto_id)))
  WHERE ((p.ativo = true) AND (p.data_fim >= now()));` },
  { name: 'vw_itens_pedido_cliente', def: `CREATE OR REPLACE VIEW public.vw_itens_pedido_cliente AS
 SELECT id,
    pedido_id,
    descricao,
    variacao,
    quantidade,
    medidas
   FROM itens_pedido i;` },
  { name: 'vw_pedidos_cliente', def: `CREATE OR REPLACE VIEW public.vw_pedidos_cliente AS
 SELECT id,
    numero_pedido,
    cliente_id,
    status,
    valor_total,
    pago,
    forma_pagamento,
    parcelas,
    data_entrega_prevista,
    data_entrega,
    created_at
   FROM pedidos p;` },
  { name: 'vw_lojao_status_pedidos', def: `CREATE OR REPLACE VIEW public.vw_lojao_status_pedidos AS
 SELECT p.id AS pedido_id,
    p.numero_pedido,
    o.numero_orcamento,
    p.cliente_id,
    COALESCE(c.nome, 'Cliente'::text) AS cliente_nome,
    c.telefone AS cliente_telefone,
    COALESCE(c.telefone_last8, "right"(regexp_replace(c.telefone, '\\D'::text, ''::text, 'g'::text), 8)) AS telefone_last8,
    p.status,
        CASE
            WHEN (p.status = 'aguardando_producao'::text) THEN 'Aguardando entrada em produção'::text
            WHEN (p.status = 'em_producao'::text) THEN 'Em produção na fábrica'::text
            WHEN (p.status = 'pronto'::text) THEN 'Pronto para entrega/retirada'::text
            WHEN (p.status = 'entregue'::text) THEN 'Entregue e concluído'::text
            WHEN (p.status = 'cancelado'::text) THEN 'Cancelado'::text
            ELSE COALESCE(p.status, 'Em andamento'::text)
        END AS status_descricao,
    p.valor_total,
    COALESCE(p.pago, false) AS pago,
        CASE
            WHEN (p.pago = true) THEN 'Pago integralmente'::text
            ELSE 'Aguardando quitação / Sinal pago'::text
        END AS situacao_financeira,
    p.forma_pagamento,
    to_char((p.data_entrega_prevista)::timestamp with time zone, 'DD/MM/YYYY'::text) AS previsao_entrega,
    p.data_entrega_prevista,
    to_char((p.data_entrega)::timestamp with time zone, 'DD/MM/YYYY'::text) AS data_entrega,
    to_char(p.created_at, 'DD/MM/YYYY'::text) AS data_pedido,
    p.created_at,
    p.responsavel_producao,
    ( SELECT string_agg(((((i.quantidade)::text || 'x '::text) || i.descricao) || COALESCE(((' ('::text || i.medidas) || ')'::text), ''::text)), '; '::text) AS string_agg
           FROM itens_pedido i
          WHERE (i.pedido_id = p.id)) AS resumo_itens,
    p.observacoes
   FROM ((pedidos p
     LEFT JOIN clientes c ON ((c.id = p.cliente_id)))
     LEFT JOIN orcamentos o ON ((o.id = p.orcamento_id)));` },
  { name: 'vw_lojao_historico_orcamentos', def: `CREATE OR REPLACE VIEW public.vw_lojao_historico_orcamentos AS
 SELECT o.id AS orcamento_id,
    o.numero_orcamento,
    o.cliente_id,
    COALESCE(c.nome, 'Cliente'::text) AS cliente_nome,
    c.telefone AS cliente_telefone,
    COALESCE(c.telefone_last8, "right"(regexp_replace(c.telefone, '\\D'::text, ''::text, 'g'::text), 8)) AS telefone_last8,
    o.valor_total,
    o.status,
        CASE
            WHEN (o.status = 'pendente'::text) THEN 'Pendente / Aberto'::text
            WHEN (o.status = 'aprovado'::text) THEN 'Aprovado'::text
            WHEN (o.status = 'rejeitado'::text) THEN 'Não fechado / Expirado'::text
            ELSE COALESCE(o.status, 'Pendente'::text)
        END AS status_descricao,
    o.forma_pagamento,
    o.data_validade,
        CASE
            WHEN ((o.data_validade IS NOT NULL) AND (o.data_validade < CURRENT_DATE)) THEN true
            ELSE false
        END AS validade_expirada,
    to_char(o.created_at, 'DD/MM/YYYY'::text) AS data_criacao,
    o.created_at,
    (EXTRACT(day FROM (now() - o.created_at)))::integer AS dias_desde_criacao,
    ( SELECT string_agg(((((i.quantidade)::text || 'x '::text) || i.descricao) || COALESCE(((' ('::text || i.medidas) || ')'::text), ''::text)), '; '::text) AS string_agg
           FROM itens_orcamento i
          WHERE (i.orcamento_id = o.id)) AS resumo_itens,
    o.observacoes
   FROM (orcamentos o
     LEFT JOIN clientes c ON ((c.id = o.cliente_id)));` },
  { name: 'vw_lojao_orcamento_lead', def: `CREATE OR REPLACE VIEW public.vw_lojao_orcamento_lead AS
 SELECT DISTINCT ON (lead_id) lead_id,
    id AS solicitacao_id,
    status AS status_solicitacao,
    COALESCE((resultado ->> 'status'::text), ''::text) AS status_calculo,
    total_centavos,
    total_final_centavos,
    fn_lojao_texto_orcamento(id) AS texto,
    (resultado -> 'pendencias'::text) AS pendencias,
    criado_em
   FROM lojao_orcamento_solicitacoes s
  WHERE (lead_id IS NOT NULL)
  ORDER BY lead_id, criado_em DESC;` },
  { name: 'vw_best_sellers', def: `CREATE OR REPLACE VIEW public.vw_best_sellers AS
 SELECT p.id AS produto_id,
    p.nome AS produto,
    sum(ip.quantidade) AS quantidade_total,
    sum(ip.preco_total) AS receita_total
   FROM ((itens_pedido ip
     JOIN pedidos ped ON ((ip.pedido_id = ped.id)))
     JOIN produtos p ON ((ip.produto_id = p.id)))
  WHERE (ped.status = ANY (ARRAY['finalizado'::text, 'entregue'::text, 'aguardando_retirada_entrega'::text, 'em_producao'::text, 'aguardando_producao'::text]))
  GROUP BY p.id, p.nome
  ORDER BY (sum(ip.preco_total)) DESC;` }
];

for (const v of views) {
  sql += `${v.def}\n\n`;
}

// 5. Trigger on contacts for automatic real-time sync with clientes table
sql += `-- =====================================================================
-- 5. TRIGGER DE SINCRONIZACAO DIRETA LOCAL: CONTACTS (CRM) -> CLIENTES (LOJAO)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fn_sync_contact_to_lojao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_nome text;
  v_telefone text;
  v_email text;
BEGIN
  v_nome := coalesce(nullif(btrim(NEW.name), ''), nullif(btrim(NEW.display_name), ''), nullif(btrim(NEW.address_book_name), ''));
  v_telefone := nullif(btrim(NEW.phone_number), '');
  v_email := nullif(btrim(NEW.email), '');

  IF v_nome IS NOT NULL THEN
    v_nome := regexp_replace(v_nome, '<[^>]*>', '', 'g');
    v_nome := regexp_replace(v_nome, '[^a-zA-Z0-9áàâãéèêíïóôõöúçñÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ\\s\\.\\,\\-\\/\'\\&]', '', 'g');
    v_nome := regexp_replace(v_nome, '\\s+', ' ', 'g');
    v_nome := regexp_replace(v_nome, '^[\\.\\,\\-\\/\'\\&\\s]+|[\\.\\,\\-\\/\'\\&\\s]+$', '', 'g');
    v_nome := nullif(btrim(v_nome), '');
  END IF;

  IF v_telefone IS NULL AND v_nome IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF coalesce(OLD.name, '') = coalesce(NEW.name, '')
       AND coalesce(OLD.display_name, '') = coalesce(NEW.display_name, '')
       AND coalesce(OLD.phone_number, '') = coalesce(NEW.phone_number, '')
       AND coalesce(OLD.email, '') = coalesce(NEW.email, '') THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Executa de forma direta e nativa no mesmo banco
  BEGIN
    PERFORM public.fn_lojao_sincronizar_contato(v_nome, v_telefone, v_email, 'crm_whatsapp');
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Falha ao sincronizar contato com o Lojao: %', SQLERRM;
  END;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_contacts_sync_lojao ON public.contacts;
CREATE TRIGGER trg_contacts_sync_lojao
AFTER INSERT OR UPDATE ON public.contacts
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_contact_to_lojao();

-- Sincroniza retroativamente todos os contatos ja existentes no CRM para o Lojao
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT name, display_name, address_book_name, phone_number, email FROM public.contacts WHERE phone_number IS NOT NULL OR name IS NOT NULL) LOOP
    PERFORM public.fn_lojao_sincronizar_contato(
      coalesce(r.name, r.display_name, r.address_book_name),
      r.phone_number,
      r.email,
      'crm_retroativo'
    );
  END LOOP;
END $$;
\n`;

// 6. Data population helper
function escapeSqlVal(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'boolean' || typeof val === 'number') return String(val);
  if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'::jsonb`;
  return `'${String(val).replace(/'/g, "''")}'`;
}

function generateTableInserts(tableName, rows, conflictCol = 'id') {
  if (!rows || rows.length === 0) return '';
  const cols = Object.keys(rows[0]);
  let out = `-- Inserindo ${rows.length} registros em ${tableName}\n`;
  for (const r of rows) {
    const colList = cols.map(c => `"${c}"`).join(', ');
    const valList = cols.map(c => escapeSqlVal(r[c])).join(', ');
    if (conflictCol) {
      out += `INSERT INTO public.${tableName} (${colList}) VALUES (${valList}) ON CONFLICT ("${conflictCol}") DO NOTHING;\n`;
    } else {
      out += `INSERT INTO public.${tableName} (${colList}) VALUES (${valList}) ON CONFLICT DO NOTHING;\n`;
    }
  }
  out += '\n';
  return out;
}

sql += `-- =====================================================================\n-- 6. DADOS HISTORICOS COMPLETOS DO LOJAO DOS MARMORES\n-- =====================================================================\n\n`;

sql += generateTableInserts('lojas', s895.lojas, 'id');
sql += generateTableInserts('profiles', s895.profiles, 'id');
sql += generateTableInserts('produtos', s833.produtos, 'id');
sql += generateTableInserts('clientes', s833.clientes, 'id');
sql += generateTableInserts('produto_variacoes', s839.produto_variacoes, 'id');
sql += generateTableInserts('orcamentos', s835.orcamentos, 'id');
sql += generateTableInserts('itens_orcamento', s835.itens_orcamento, 'id');
sql += generateTableInserts('pedidos', s895.pedidos, 'id');
sql += generateTableInserts('itens_pedido', s895.itens_pedido, 'id');
sql += generateTableInserts('promocoes', s895.promocoes, 'id');
sql += generateTableInserts('promocoes_envios', s895.promocoes_envios, 'id');
sql += generateTableInserts('orcamento_requests', s895.orcamento_requests, 'id');
sql += generateTableInserts('aniversarios_enviados', s895.aniversarios_enviados, 'id');
sql += generateTableInserts('catalogo_ambientes', s895.catalogo_ambientes, 'id');
sql += generateTableInserts('lojao_parametros_v3', s895.lojao_parametros_v3, 'chave');
sql += generateTableInserts('lojao_regras_calculo', s831.regras_calculo, 'variacao');
sql += generateTableInserts('lojao_regras_extras', s831.regras_extras, 'codigo');
sql += generateTableInserts('lojao_precos_venda', s837.precos_venda, 'id');
sql += generateTableInserts('lojao_orcamento_solicitacoes', s831.solicitacoes, 'id');
sql += generateTableInserts('lojao_api_tokens', s831.api_tokens, 'id');
sql += generateTableInserts('lojao_crm_token', s831.crm_token, 'id');

// 7. Permissions and RLS policies
sql += `-- =====================================================================
-- 7. PERMISSOES E POLICIES RLS
-- =====================================================================

GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO postgres, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO postgres, anon, authenticated, service_role;

-- Desabilita RLS nas tabelas do Lojao para acesso irrestrito do CRM e da API
ALTER TABLE public.lojas DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.produtos DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.produto_variacoes DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.orcamentos DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.itens_orcamento DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.itens_pedido DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.promocoes DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.promocoes_envios DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.orcamento_requests DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.aniversarios_enviados DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.aniversarios_log DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalogo_ambientes DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.fornecedores DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagamentos_fornecedores DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.relatorios DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.historico_relatorios DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuracoes_relatorios DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_progress DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.lojao_precos_venda DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.lojao_regras_calculo DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.lojao_regras_extras DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.lojao_parametros_v3 DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.lojao_orcamento_solicitacoes DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.lojao_api_tokens DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.lojao_crm_token DISABLE ROW LEVEL SECURITY;

COMMIT;

-- Relatorio de contagem pos-migracao
SELECT 'clientes' AS tabela, count(*) FROM public.clientes
UNION ALL SELECT 'orcamentos', count(*) FROM public.orcamentos
UNION ALL SELECT 'itens_orcamento', count(*) FROM public.itens_orcamento
UNION ALL SELECT 'produtos', count(*) FROM public.produtos
UNION ALL SELECT 'produto_variacoes', count(*) FROM public.produto_variacoes
UNION ALL SELECT 'lojao_precos_venda', count(*) FROM public.lojao_precos_venda
UNION ALL SELECT 'lojao_parametros_v3', count(*) FROM public.lojao_parametros_v3
UNION ALL SELECT 'pedidos', count(*) FROM public.pedidos;
`;

fs.writeFileSync('supabase/lojao_complete.sql', sql, 'utf8');
console.log('Successfully wrote supabase/lojao_complete.sql (size: ' + (sql.length / 1024).toFixed(1) + ' KB)');

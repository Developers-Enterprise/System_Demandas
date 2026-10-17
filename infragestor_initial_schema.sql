-- =========================================================================
-- INFRAGESTOR — SCRIPT DE FUNDAÇÃO
-- Criação de Tabelas, Triggers, RLS e Cron Jobs.
-- =========================================================================

-- 1. LIMPEZA TOTAL (Ordem reversa para respeitar Foreign Keys)
DROP EXTENSION IF EXISTS pg_net CASCADE;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();
DROP TABLE IF EXISTS public.demand_history CASCADE;
DROP TABLE IF EXISTS public.demands CASCADE;
DROP TABLE IF EXISTS public.works CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

-- =========================================================================
-- 2. CRIAÇÃO DAS TABELAS
-- =========================================================================

-- PERFIS
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  role TEXT DEFAULT 'colab',
  initial TEXT,
  prof_type TEXT DEFAULT 'Engenharia'
);

-- OBRAS
CREATE TABLE public.works (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  bairro TEXT,
  localizacao TEXT,
  objeto TEXT,
  processo TEXT,
  status TEXT DEFAULT 'Em planejamento',
  prioridade TEXT DEFAULT 'Normal',
  valor_estimado TEXT,
  prazo_previsto DATE,
  obs TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- DEMANDAS
CREATE TABLE public.demands (
  id BIGSERIAL PRIMARY KEY,
  work_id BIGINT REFERENCES public.works(id) ON DELETE CASCADE,
  title TEXT,
  esp TEXT,
  resp TEXT, 
  resp_id UUID REFERENCES public.profiles(id),
  prazo DATE,
  status TEXT DEFAULT 'Triagem',
  drive TEXT,
  obs TEXT,
  prioridade TEXT DEFAULT 'Normal',
  processo_numero TEXT,
  termo_referencia TEXT,
  matriz_riscos TEXT,
  alteracao_estrutural BOOLEAN DEFAULT false,
  responsaveis JSONB DEFAULT '[]'::jsonb,
  anexos JSONB DEFAULT '{}'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- HISTÓRICO
CREATE TABLE public.demand_history (
  id BIGSERIAL PRIMARY KEY,
  demand_id BIGINT REFERENCES public.demands(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id),
  action_type TEXT,
  old_value TEXT,
  new_value TEXT,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =========================================================================
-- 3. GATILHO (TRIGGER) DE AUTOMAÇÃO DE NOVOS USUÁRIOS
-- =========================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, name, role, initial)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'colab'),
    COALESCE(NEW.raw_user_meta_data->>'initial', upper(substring(split_part(NEW.email, '@', 1), 1, 2)))
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================================================================
-- 4. FUNÇÕES DE AUTORIZAÇÃO (ACL)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.is_infra_manager(uid uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = uid AND role IN ('admin', 'prefeito'));
$$;

CREATE OR REPLACE FUNCTION public.is_infra_admin(uid uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = uid AND role = 'admin');
$$;

CREATE OR REPLACE FUNCTION public.is_infra_technical(uid uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = uid AND role = 'colab');
$$;

CREATE OR REPLACE FUNCTION public.user_has_infra_work_access(p_work_id bigint, uid uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_infra_manager(uid)
    OR EXISTS (
      SELECT 1 FROM public.demands d
      WHERE d.work_id = p_work_id AND p_work_id IS NOT NULL
      AND (d.resp_id = uid OR d.responsaveis @> jsonb_build_array(jsonb_build_object('id', uid::text)))
    );
$$;

-- =========================================================================
-- 5. ROW LEVEL SECURITY (RLS) - REGRAS DE SEGURANÇA
-- =========================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.works ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.demands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.demand_history ENABLE ROW LEVEL SECURITY;

-- PERMISSOES BÁSICAS
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON public.profiles TO anon; 
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- RLS: PROFILES
CREATE POLICY "Leitura de perfis para autenticados" ON public.profiles FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Usuário atualiza o próprio perfil" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- RLS: OBRAS
CREATE POLICY "Infra works select" ON public.works FOR SELECT USING (public.user_has_infra_work_access(id, auth.uid()));
CREATE POLICY "Infra works insert admin" ON public.works FOR INSERT WITH CHECK (public.is_infra_admin(auth.uid()));
CREATE POLICY "Infra works update" ON public.works FOR UPDATE USING (
  public.is_infra_admin(auth.uid()) OR (public.is_infra_technical(auth.uid()) AND public.user_has_infra_work_access(id, auth.uid()))
);

-- RLS: DEMANDAS
CREATE POLICY "Infra demands select by work" ON public.demands FOR SELECT USING (
  public.is_infra_manager(auth.uid())
  OR resp_id = auth.uid()
  OR responsaveis @> jsonb_build_array(jsonb_build_object('id', auth.uid()::text))
  OR public.user_has_infra_work_access(work_id, auth.uid())
);
CREATE POLICY "Infra demands insert admin" ON public.demands FOR INSERT WITH CHECK (public.is_infra_admin(auth.uid()));
CREATE POLICY "Infra demands update assigned" ON public.demands FOR UPDATE USING (
  public.is_infra_admin(auth.uid()) OR resp_id = auth.uid() OR responsaveis @> jsonb_build_array(jsonb_build_object('id', auth.uid()::text))
);
CREATE POLICY "Infra demands delete admin" ON public.demands FOR DELETE USING (public.is_infra_admin(auth.uid()));

-- RLS: HISTÓRICO
CREATE POLICY "Infra history select" ON public.demand_history FOR SELECT USING (
  public.is_infra_manager(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.demands d WHERE d.id = demand_id AND (
      d.resp_id = auth.uid() OR d.responsaveis @> jsonb_build_array(jsonb_build_object('id', auth.uid()::text)) OR public.user_has_infra_work_access(d.work_id, auth.uid())
    )
  )
);
CREATE POLICY "Infra history insert" ON public.demand_history FOR INSERT WITH CHECK (auth.uid() = user_id OR public.is_infra_admin(auth.uid()));

-- =========================================================================
-- 6. STORAGE (ARQUIVOS)
-- =========================================================================
INSERT INTO storage.buckets (id, name, public) VALUES ('demand-files', 'demand-files', true) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Infra - ler arquivos" ON storage.objects FOR SELECT USING (bucket_id = 'demand-files');
CREATE POLICY "Infra - enviar arquivos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'demand-files');
CREATE POLICY "Infra - atualizar arquivos" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'demand-files');
CREATE POLICY "Infra - excluir arquivos" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'demand-files');

NOTIFY pgrst, 'reload schema';
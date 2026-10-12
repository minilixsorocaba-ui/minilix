-- Preparação fiscal interna: nenhum documento fiscal é emitido nesta etapa.
CREATE TABLE IF NOT EXISTS fiscal_drafts (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),customer_id UUID NOT NULL REFERENCES customers(id),
 rental_id UUID REFERENCES rentals(id),financial_entry_id UUID REFERENCES financial_entries(id),
 competence DATE NOT NULL,service_description TEXT NOT NULL CHECK(length(trim(service_description))>0),
 planned_amount NUMERIC(12,2) NOT NULL CHECK(planned_amount>=0),
 status TEXT NOT NULL DEFAULT 'RASCUNHO' CHECK(status IN('RASCUNHO','ARQUIVADO')),
 version INT NOT NULL DEFAULT 1,created_by UUID NOT NULL REFERENCES users(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_fiscal_active_finance ON fiscal_drafts(financial_entry_id) WHERE status='RASCUNHO' AND financial_entry_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS fiscal_draft_audit(id BIGSERIAL PRIMARY KEY,draft_id UUID NOT NULL REFERENCES fiscal_drafts(id),actor_id UUID NOT NULL REFERENCES users(id),action TEXT NOT NULL,details JSONB NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE INDEX IF NOT EXISTS idx_fiscal_customer ON fiscal_drafts(customer_id,created_at DESC);
CREATE OR REPLACE FUNCTION fiscal_protect_audit() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'Histórico fiscal interno não pode ser alterado ou excluído'; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS fiscal_audit_immutable ON fiscal_draft_audit;
CREATE TRIGGER fiscal_audit_immutable BEFORE UPDATE OR DELETE ON fiscal_draft_audit FOR EACH ROW EXECUTE FUNCTION fiscal_protect_audit();

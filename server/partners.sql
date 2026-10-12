CREATE TABLE IF NOT EXISTS partner_contracts (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),code TEXT UNIQUE NOT NULL,name TEXT NOT NULL,document TEXT NOT NULL,address TEXT NOT NULL,representative TEXT NOT NULL,bank_details TEXT NOT NULL,starts_on DATE NOT NULL,ends_on DATE NOT NULL,rate NUMERIC(5,2) NOT NULL DEFAULT 3 CHECK(rate=3),status TEXT NOT NULL DEFAULT 'ATIVO' CHECK(status IN('ATIVO','ENCERRADO')),terms_version TEXT NOT NULL DEFAULT 'PILOTO-3PCT-90D-V1',accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),created_by UUID NOT NULL REFERENCES users(id),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),CHECK(ends_on=starts_on+89));
CREATE UNIQUE INDEX IF NOT EXISTS ux_partner_active_document ON partner_contracts(document) WHERE status='ATIVO';
CREATE TABLE IF NOT EXISTS partner_users (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,active BOOLEAN NOT NULL DEFAULT true,session_version INT NOT NULL DEFAULT 1,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS partner_memberships (user_id UUID REFERENCES partner_users(id),contract_id UUID REFERENCES partner_contracts(id),role TEXT NOT NULL CHECK(role IN('SINDICO','ADMINISTRADORA')),active BOOLEAN NOT NULL DEFAULT true,PRIMARY KEY(user_id,contract_id));
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS partner_contract_id UUID REFERENCES partner_contracts(id);
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS partner_unit TEXT;
ALTER TABLE financial_entries ADD COLUMN IF NOT EXISTS partner_eligible_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK(partner_eligible_amount>=0 AND partner_eligible_amount<=amount);
CREATE TABLE IF NOT EXISTS partner_payouts (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),contract_id UUID NOT NULL REFERENCES partner_contracts(id),amount NUMERIC(12,2) NOT NULL CHECK(amount>0),bank_snapshot TEXT NOT NULL,transfer_reference TEXT UNIQUE NOT NULL,proof TEXT NOT NULL,paid_at TIMESTAMPTZ NOT NULL,created_by UUID NOT NULL REFERENCES users(id),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS partner_ledger (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),contract_id UUID NOT NULL REFERENCES partner_contracts(id),rental_id UUID NOT NULL REFERENCES rentals(id),amount NUMERIC(12,2) NOT NULL CHECK(amount<>0),eligible_base NUMERIC(12,2) NOT NULL,rate NUMERIC(5,2) NOT NULL,reason TEXT NOT NULL,payout_id UUID REFERENCES partner_payouts(id),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS partner_audit (id BIGSERIAL PRIMARY KEY,contract_id UUID REFERENCES partner_contracts(id),actor_id UUID NOT NULL,action TEXT NOT NULL,details JSONB NOT NULL DEFAULT '{}',created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE INDEX IF NOT EXISTS idx_partner_rentals ON rentals(partner_contract_id,created_at);
CREATE INDEX IF NOT EXISTS idx_partner_ledger ON partner_ledger(contract_id,created_at);
CREATE OR REPLACE FUNCTION partner_protect_contract() RETURNS trigger AS $$ BEGIN
IF (NEW.code,NEW.starts_on,NEW.ends_on,NEW.rate,NEW.terms_version,NEW.document) IS DISTINCT FROM (OLD.code,OLD.starts_on,OLD.ends_on,OLD.rate,OLD.terms_version,OLD.document) THEN RAISE EXCEPTION 'Condições e código são imutáveis'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS partner_contract_immutable ON partner_contracts;
CREATE TRIGGER partner_contract_immutable BEFORE UPDATE ON partner_contracts FOR EACH ROW EXECUTE FUNCTION partner_protect_contract();
CREATE OR REPLACE FUNCTION partner_protect_rental() RETURNS trigger AS $$ BEGIN
IF OLD.partner_contract_id IS NOT NULL AND (NEW.partner_contract_id,NEW.partner_unit) IS DISTINCT FROM (OLD.partner_contract_id,OLD.partner_unit) THEN RAISE EXCEPTION 'Vínculo do condomínio é imutável'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS partner_rental_immutable ON rentals;
CREATE TRIGGER partner_rental_immutable BEFORE UPDATE ON rentals FOR EACH ROW EXECUTE FUNCTION partner_protect_rental();
CREATE OR REPLACE FUNCTION partner_reconcile(rid UUID) RETURNS void AS $$
DECLARE r rentals%ROWTYPE; c partner_contracts%ROWTYPE; base NUMERIC; desired NUMERIC:=0; previous NUMERIC; delta NUMERIC;
BEGIN
SELECT * INTO r FROM rentals WHERE id=rid FOR UPDATE;
IF r.partner_contract_id IS NULL THEN RETURN; END IF;
SELECT * INTO c FROM partner_contracts WHERE id=r.partner_contract_id FOR UPDATE;
SELECT COALESCE(SUM(LEAST(amount,partner_eligible_amount)),0) INTO base FROM financial_entries WHERE rental_id=rid AND type='RECEITA' AND status='PAGO';
IF r.status='CONCLUIDA' AND base>0 AND NOT EXISTS(SELECT 1 FROM financial_entries WHERE rental_id=rid AND type='RECEITA' AND status='ABERTO' AND amount>0) THEN desired:=ROUND(base*c.rate/100,2); END IF;
SELECT COALESCE(SUM(amount),0) INTO previous FROM partner_ledger WHERE rental_id=rid; delta:=desired-previous;
IF delta<>0 THEN INSERT INTO partner_ledger(contract_id,rental_id,amount,eligible_base,rate,reason) VALUES(c.id,rid,delta,base,c.rate,CASE WHEN delta>0 THEN 'GERACAO_OU_RECOMPOSICAO' ELSE 'AJUSTE_OU_ESTORNO' END); END IF;
END; $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION partner_rental_sync() RETURNS trigger AS $$ BEGIN PERFORM partner_reconcile(NEW.id); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS partner_rental_cashback ON rentals;
CREATE TRIGGER partner_rental_cashback AFTER INSERT OR UPDATE OF status,partner_contract_id ON rentals FOR EACH ROW EXECUTE FUNCTION partner_rental_sync();
CREATE OR REPLACE FUNCTION partner_finance_sync() RETURNS trigger AS $$ BEGIN
IF TG_OP='DELETE' THEN PERFORM partner_reconcile(OLD.rental_id); RETURN OLD; END IF;
PERFORM partner_reconcile(NEW.rental_id);
IF TG_OP='UPDATE' AND OLD.rental_id IS DISTINCT FROM NEW.rental_id THEN PERFORM partner_reconcile(OLD.rental_id); END IF; RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS partner_finance_cashback ON financial_entries;
CREATE TRIGGER partner_finance_cashback AFTER INSERT OR UPDATE OR DELETE ON financial_entries FOR EACH ROW EXECUTE FUNCTION partner_finance_sync();
CREATE OR REPLACE FUNCTION partner_protect_ledger() RETURNS trigger AS $$ BEGIN
IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Extrato não pode ser excluído'; END IF;
IF (NEW.contract_id,NEW.rental_id,NEW.amount,NEW.eligible_base,NEW.rate,NEW.reason,NEW.created_at) IS DISTINCT FROM (OLD.contract_id,OLD.rental_id,OLD.amount,OLD.eligible_base,OLD.rate,OLD.reason,OLD.created_at) OR OLD.payout_id IS NOT NULL OR NEW.payout_id IS NULL THEN RAISE EXCEPTION 'Extrato é imutável'; END IF; RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS partner_ledger_immutable ON partner_ledger;
CREATE TRIGGER partner_ledger_immutable BEFORE UPDATE OR DELETE ON partner_ledger FOR EACH ROW EXECUTE FUNCTION partner_protect_ledger();
ALTER TABLE financial_entries ADD COLUMN IF NOT EXISTS partner_payout_id UUID REFERENCES partner_payouts(id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_partner_payout_finance ON financial_entries(partner_payout_id) WHERE partner_payout_id IS NOT NULL;
CREATE OR REPLACE FUNCTION partner_protect_paid_record() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'Repasse e auditoria não podem ser alterados ou excluídos'; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS partner_payout_immutable ON partner_payouts;
CREATE TRIGGER partner_payout_immutable BEFORE UPDATE OR DELETE ON partner_payouts FOR EACH ROW EXECUTE FUNCTION partner_protect_paid_record();
DROP TRIGGER IF EXISTS partner_audit_immutable ON partner_audit;
CREATE TRIGGER partner_audit_immutable BEFORE UPDATE OR DELETE ON partner_audit FOR EACH ROW EXECUTE FUNCTION partner_protect_paid_record();
CREATE OR REPLACE FUNCTION partner_protect_payout_finance() RETURNS trigger AS $$ BEGIN
IF OLD.partner_payout_id IS NOT NULL THEN RAISE EXCEPTION 'Despesa de cashback liquidado é imutável'; END IF;
IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS partner_payout_finance_immutable ON financial_entries;
CREATE TRIGGER partner_payout_finance_immutable BEFORE UPDATE OR DELETE ON financial_entries FOR EACH ROW EXECUTE FUNCTION partner_protect_payout_finance();

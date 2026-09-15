
-- Regra comercial: contratação inicial = R$ 100,00 por tambor por dia.
CREATE OR REPLACE FUNCTION minilix_initial_rental_price() RETURNS trigger AS $$
DECLARE total_days INTEGER;
BEGIN
  IF NEW.type='RECEITA' AND NEW.rental_id IS NOT NULL THEN
    SELECT COALESCE(SUM(quantity * GREATEST(days,1)),0)::int INTO total_days FROM rental_items WHERE rental_id=NEW.rental_id;
    IF total_days > 0 THEN NEW.amount := total_days * 100.00; END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_minilix_initial_rental_price ON financial_entries;
CREATE TRIGGER trg_minilix_initial_rental_price BEFORE INSERT ON financial_entries FOR EACH ROW EXECUTE FUNCTION minilix_initial_rental_price();

CREATE OR REPLACE FUNCTION enforce_service_order_status_transition() RETURNS trigger AS $$ BEGIN IF NEW.status=OLD.status THEN RETURN NEW; END IF; IF OLD.status='PENDENTE' AND NEW.status NOT IN('ATRIBUIDA','CANCELADA') THEN RAISE EXCEPTION 'Transição de OS inválida: PENDENTE -> %',NEW.status; ELSIF OLD.status='ATRIBUIDA' AND NEW.status NOT IN('PENDENTE','A_CAMINHO','CANCELADA') THEN RAISE EXCEPTION 'Transição de OS inválida: ATRIBUIDA -> %',NEW.status; ELSIF OLD.status='A_CAMINHO' AND NEW.status NOT IN('NO_LOCAL','CANCELADA') THEN RAISE EXCEPTION 'Transição de OS inválida: A_CAMINHO -> %',NEW.status; ELSIF OLD.status='NO_LOCAL' AND NEW.status NOT IN('CONCLUIDA','CANCELADA') THEN RAISE EXCEPTION 'Transição de OS inválida: NO_LOCAL -> %',OLD.status; ELSIF OLD.status IN('CONCLUIDA','CANCELADA') THEN RAISE EXCEPTION 'OS finalizada não pode voltar de status: %',OLD.status; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_service_order_status_transition ON service_orders; CREATE TRIGGER trg_service_order_status_transition BEFORE UPDATE OF status ON service_orders FOR EACH ROW EXECUTE FUNCTION enforce_service_order_status_transition();
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,role TEXT NOT NULL CHECK (role IN ('ADMIN','ATENDIMENTO','MOTORISTA')),active BOOLEAN NOT NULL DEFAULT TRUE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS customers (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),name TEXT NOT NULL,document TEXT,phone TEXT,email TEXT,notes TEXT,password_hash TEXT,active BOOLEAN NOT NULL DEFAULT TRUE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
ALTER TABLE customers ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;
CREATE UNIQUE INDEX IF NOT EXISTS ux_customers_email_lower ON customers(LOWER(email)) WHERE email IS NOT NULL;
CREATE TABLE IF NOT EXISTS addresses (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,cep TEXT,street TEXT NOT NULL,number TEXT NOT NULL,complement TEXT,neighborhood TEXT,city TEXT NOT NULL DEFAULT 'Sorocaba',state TEXT NOT NULL DEFAULT 'SP',reference TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS containers (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),name TEXT NOT NULL,capacity_liters INTEGER NOT NULL,active BOOLEAN NOT NULL DEFAULT TRUE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS container_assets (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),container_id UUID NOT NULL REFERENCES containers(id),patrimony_code TEXT UNIQUE NOT NULL,qr_token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(12),'hex'),status TEXT NOT NULL DEFAULT 'DISPONIVEL' CHECK (status IN ('DISPONIVEL','ALUGADO','MANUTENCAO','INATIVO')),notes TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS rentals (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),customer_id UUID NOT NULL REFERENCES customers(id),address_id UUID NOT NULL REFERENCES addresses(id),scheduled_date DATE NOT NULL,pickup_date DATE,due_date DATE,status TEXT NOT NULL DEFAULT 'ABERTA' CHECK (status IN ('ABERTA','AGENDADA','EM_EXECUCAO','CONCLUIDA','CANCELADA')),notes TEXT,created_by UUID REFERENCES users(id),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS rental_items (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),rental_id UUID NOT NULL REFERENCES rentals(id) ON DELETE CASCADE,container_id UUID NOT NULL REFERENCES containers(id),asset_id UUID REFERENCES container_assets(id),quantity INTEGER NOT NULL CHECK (quantity > 0),days INTEGER NOT NULL DEFAULT 1 CHECK (days > 0),daily_rate NUMERIC(12,2) NOT NULL DEFAULT 0,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS rental_events (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),rental_id UUID NOT NULL REFERENCES rentals(id) ON DELETE CASCADE,asset_id UUID REFERENCES container_assets(id),event_type TEXT NOT NULL,description TEXT,user_id UUID REFERENCES users(id),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE SEQUENCE IF NOT EXISTS os_number_seq START 1;
CREATE TABLE IF NOT EXISTS service_orders (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),number TEXT UNIQUE NOT NULL,rental_id UUID NOT NULL REFERENCES rentals(id) ON DELETE CASCADE,driver_id UUID REFERENCES users(id),order_type TEXT NOT NULL DEFAULT 'ENTREGA' CHECK (order_type IN ('ENTREGA','RETIRADA')),status TEXT NOT NULL DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE','ATRIBUIDA','A_CAMINHO','NO_LOCAL','CONCLUIDA','CANCELADA')),scheduled_date DATE NOT NULL,started_at TIMESTAMPTZ,completed_at TIMESTAMPTZ,driver_notes TEXT,route_url TEXT,photo_data TEXT,customer_confirmation TEXT,confirmed_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS client_requests (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,rental_id UUID REFERENCES rentals(id) ON DELETE SET NULL,type TEXT NOT NULL CHECK (type IN ('RETIRADA','DIAS_ADICIONAIS','TAMBOR_ADICIONAL','TROCA_TAMBOR','SUPORTE')),details TEXT,status TEXT NOT NULL DEFAULT 'ABERTA' CHECK (status IN ('ABERTA','EM_ATENDIMENTO','CONCLUIDA','CANCELADA')),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE INDEX IF NOT EXISTS idx_client_requests_customer ON client_requests(customer_id,created_at DESC);
CREATE TABLE IF NOT EXISTS financial_entries (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),rental_id UUID REFERENCES rentals(id) ON DELETE SET NULL,customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,type TEXT NOT NULL CHECK (type IN ('RECEITA','DESPESA')),description TEXT NOT NULL,amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),due_date DATE,paid_at TIMESTAMPTZ,status TEXT NOT NULL DEFAULT 'ABERTO' CHECK (status IN ('ABERTO','PAGO','CANCELADO')),created_by UUID REFERENCES users(id),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());

ALTER TABLE rental_items ADD COLUMN IF NOT EXISTS asset_id UUID REFERENCES container_assets(id);
ALTER TABLE rental_items ADD COLUMN IF NOT EXISTS days INTEGER NOT NULL DEFAULT 1;
ALTER TABLE rental_items ADD COLUMN IF NOT EXISTS daily_rate NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS pickup_date DATE;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS order_type TEXT NOT NULL DEFAULT 'ENTREGA';
ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS route_url TEXT;
ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS photo_data TEXT;
ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS customer_confirmation TEXT;
ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;
ALTER TABLE financial_entries ADD COLUMN IF NOT EXISTS source_rental_item_id UUID REFERENCES rental_items(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_finance_source_rental_item ON financial_entries(source_rental_item_id) WHERE source_rental_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name); CREATE INDEX IF NOT EXISTS idx_rentals_scheduled_date ON rentals(scheduled_date); CREATE INDEX IF NOT EXISTS idx_rentals_due_date ON rentals(due_date); CREATE INDEX IF NOT EXISTS idx_orders_scheduled_date ON service_orders(scheduled_date); CREATE INDEX IF NOT EXISTS idx_orders_driver ON service_orders(driver_id); CREATE INDEX IF NOT EXISTS idx_assets_status ON container_assets(status); CREATE INDEX IF NOT EXISTS idx_events_rental ON rental_events(rental_id,created_at DESC); CREATE INDEX IF NOT EXISTS idx_financial_status ON financial_entries(status,due_date);

INSERT INTO containers(name,capacity_liters) SELECT 'Tambor 200 L',200 WHERE NOT EXISTS(SELECT 1 FROM containers WHERE capacity_liters=200);
UPDATE containers SET active=false WHERE capacity_liters<>200;
UPDATE container_assets SET status='INATIVO' WHERE container_id IN (SELECT id FROM containers WHERE capacity_liters<>200) AND status<>'ALUGADO';
DO $$ DECLARE c UUID; i INTEGER; code TEXT; BEGIN SELECT id INTO c FROM containers WHERE capacity_liters=200 ORDER BY created_at LIMIT 1; IF c IS NOT NULL THEN FOR i IN 1..20 LOOP code:='ML-200-'||LPAD(i::text,3,'0'); INSERT INTO container_assets(container_id,patrimony_code) VALUES(c,code) ON CONFLICT(patrimony_code) DO NOTHING; END LOOP; END IF; END $$;

-- A receita inicial é gravada pelo backend: R$ 100,00 por tambor + R$ 20,00 por dia adicional, uma única vez.
DROP TRIGGER IF EXISTS trg_minilix_initial_rental_price ON financial_entries;
DROP FUNCTION IF EXISTS minilix_initial_rental_price();

-- Tambor solicitado posteriormente: gera uma receita independente de R$ 70,00.
-- source_rental_item_id garante que uma repetição da mesma operação não duplique a cobrança.
CREATE OR REPLACE FUNCTION minilix_additional_container_finance() RETURNS trigger AS $$
DECLARE customer UUID; due DATE;
BEGIN
  IF NEW.daily_rate = 70.00 AND NEW.quantity = 1 THEN
    SELECT r.customer_id, r.due_date INTO customer, due FROM rentals r WHERE r.id=NEW.rental_id;
    IF customer IS NOT NULL THEN
      INSERT INTO financial_entries(rental_id,customer_id,type,description,amount,due_date,status,source_rental_item_id)
      VALUES(NEW.rental_id,customer,'RECEITA','Tambor adicional',70.00,due,'ABERTO',NEW.id)
      ON CONFLICT (source_rental_item_id) DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_minilix_additional_container_finance ON rental_items;
CREATE TRIGGER trg_minilix_additional_container_finance AFTER INSERT ON rental_items FOR EACH ROW EXECUTE FUNCTION minilix_additional_container_finance();

CREATE OR REPLACE FUNCTION enforce_service_order_status_transition() RETURNS trigger AS $$ BEGIN IF NEW.status=OLD.status THEN RETURN NEW; END IF; IF OLD.status='PENDENTE' AND NEW.status NOT IN('ATRIBUIDA','CANCELADA') THEN RAISE EXCEPTION 'Transição de OS inválida: PENDENTE -> %',NEW.status; ELSIF OLD.status='ATRIBUIDA' AND NEW.status NOT IN('PENDENTE','A_CAMINHO','CANCELADA') THEN RAISE EXCEPTION 'Transição de OS inválida: ATRIBUIDA -> %',NEW.status; ELSIF OLD.status='A_CAMINHO' AND NEW.status NOT IN('NO_LOCAL','CANCELADA') THEN RAISE EXCEPTION 'Transição de OS inválida: A_CAMINHO -> %',OLD.status; ELSIF OLD.status='NO_LOCAL' AND NEW.status NOT IN('CONCLUIDA','CANCELADA') THEN RAISE EXCEPTION 'OS finalizada não pode voltar de status: %',OLD.status; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_service_order_status_transition ON service_orders; CREATE TRIGGER trg_service_order_status_transition BEFORE UPDATE OF status ON service_orders FOR EACH ROW EXECUTE FUNCTION enforce_service_order_status_transition();

-- Ao concluir uma OS de retirada, libera todos os patrimônios da locação,
-- registra a data de retirada e fecha a locação. Isso fecha o ciclo operacional.
CREATE OR REPLACE FUNCTION minilix_close_rental_on_pickup() RETURNS trigger AS $$
BEGIN
  IF NEW.status='CONCLUIDA' AND OLD.status<>'CONCLUIDA' AND NEW.order_type='RETIRADA' THEN
    UPDATE container_assets
       SET status='DISPONIVEL'
     WHERE id IN (SELECT asset_id FROM rental_items WHERE rental_id=NEW.rental_id AND asset_id IS NOT NULL)
       AND status='ALUGADO';
    UPDATE rentals SET pickup_date=CURRENT_DATE,status='CONCLUIDA' WHERE id=NEW.rental_id;
    INSERT INTO rental_events(rental_id,event_type,description)
      VALUES(NEW.rental_id,'RETIRADA_FINALIZADA','Tambores devolvidos ao estoque e locação encerrada.');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_minilix_close_rental_on_pickup ON service_orders;
CREATE TRIGGER trg_minilix_close_rental_on_pickup AFTER UPDATE OF status ON service_orders FOR EACH ROW EXECUTE FUNCTION minilix_close_rental_on_pickup();

-- Garante que novas OS de retirada usem o endereço real da locação na rota.
CREATE OR REPLACE FUNCTION minilix_retirement_route() RETURNS trigger AS $$
DECLARE s TEXT; n TEXT; c TEXT; st TEXT;
BEGIN
  IF NEW.order_type='RETIRADA' THEN
    SELECT a.street,a.number,a.city,a.state INTO s,n,c,st
      FROM rentals r JOIN addresses a ON a.id=r.address_id WHERE r.id=NEW.rental_id;
    IF s IS NOT NULL THEN
      NEW.route_url := 'https://www.google.com/maps/search/?api=1&query=' || encode(convert_to(s || ', ' || n || ', ' || c || ', ' || st,'UTF8'),'escape');
      NEW.route_url := replace(NEW.route_url,'%','%25');
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_minilix_retirement_route ON service_orders;
CREATE TRIGGER trg_minilix_retirement_route BEFORE INSERT ON service_orders FOR EACH ROW EXECUTE FUNCTION minilix_retirement_route();

-- A entrega concluída sempre cria uma única OS de retirada automaticamente.
-- Isso elimina dependência de um botão manual e torna a operação idempotente.
CREATE OR REPLACE FUNCTION minilix_auto_pickup_on_delivery() RETURNS trigger AS $$
DECLARE existing_id UUID; n TEXT; due DATE;
BEGIN
  IF NEW.status='CONCLUIDA' AND OLD.status<>'CONCLUIDA' AND NEW.order_type='ENTREGA' THEN
    SELECT id INTO existing_id
      FROM service_orders
      WHERE rental_id=NEW.rental_id AND order_type='RETIRADA' AND status<>'CANCELADA'
      ORDER BY created_at DESC LIMIT 1;
    IF existing_id IS NULL THEN
      SELECT 'OS-' || to_char(CURRENT_DATE,'YYYY') || '-' || LPAD(nextval('os_number_seq')::text,6,'0'), r.due_date
        INTO n,due FROM rentals r WHERE r.id=NEW.rental_id;
      INSERT INTO service_orders(number,rental_id,scheduled_date,order_type,route_url)
        VALUES(n,NEW.rental_id,COALESCE(due,CURRENT_DATE),'RETIRADA',NULL);
      INSERT INTO rental_events(rental_id,event_type,description)
        VALUES(NEW.rental_id,'OS_RETIRADA_CRIADA', 'OS ' || n || ' de retirada criada automaticamente após a conclusão da entrega.');
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_minilix_auto_pickup_on_delivery ON service_orders;
CREATE TRIGGER trg_minilix_auto_pickup_on_delivery AFTER UPDATE OF status ON service_orders FOR EACH ROW EXECUTE FUNCTION minilix_auto_pickup_on_delivery();

-- Backfill seguro: corrige entregas já concluídas que ainda não possuem retirada.
DO $$ DECLARE r RECORD; n TEXT; existing_id UUID; BEGIN
  FOR r IN SELECT o.rental_id FROM service_orders o WHERE o.order_type='ENTREGA' AND o.status='CONCLUIDA' LOOP
    SELECT so.id INTO existing_id FROM service_orders so WHERE so.rental_id=r.rental_id AND so.order_type='RETIRADA' AND so.status<>'CANCELADA' LIMIT 1;
    IF existing_id IS NULL THEN
      n := 'OS-' || to_char(CURRENT_DATE,'YYYY') || '-' || LPAD(nextval('os_number_seq')::text,6,'0');
      INSERT INTO service_orders(number,rental_id,scheduled_date,order_type,route_url)
        SELECT n,rt.id,COALESCE(rt.due_date,CURRENT_DATE),'RETIRADA',NULL FROM rentals rt WHERE rt.id=r.rental_id;
      INSERT INTO rental_events(rental_id,event_type,description)
        VALUES(r.rental_id,'OS_RETIRADA_CRIADA','OS ' || n || ' de retirada criada automaticamente para entrega já concluída.');
    END IF;
  END LOOP;
END $$;


-- ==================== V6 MULTIUNIDADE / FRANQUIAS ====================
-- Fundação estrutural para operar uma empresa, várias unidades e, futuramente,
-- grupos/franqueados sem quebrar os registros já existentes.
CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  legal_name TEXT,
  document TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  city TEXT,
  state TEXT DEFAULT 'SP',
  type TEXT NOT NULL DEFAULT 'PROPRIA' CHECK (type IN ('PROPRIA','FRANQUIA')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, code)
);

INSERT INTO companies(name)
SELECT 'MiniLix'
WHERE NOT EXISTS (SELECT 1 FROM companies);

INSERT INTO units(company_id,name,code,city,state,type)
SELECT c.id,'MiniLix Sorocaba','SOROCABA','Sorocaba','SP','PROPRIA'
FROM companies c
WHERE NOT EXISTS (SELECT 1 FROM units WHERE code='SOROCABA');

ALTER TABLE users ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES units(id);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES units(id);
ALTER TABLE addresses ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES units(id);
ALTER TABLE containers ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES units(id);
ALTER TABLE container_assets ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES units(id);
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES units(id);
ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES units(id);
ALTER TABLE financial_entries ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES units(id);
ALTER TABLE client_requests ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES units(id);

UPDATE users SET unit_id=(SELECT id FROM units WHERE code='SOROCABA' LIMIT 1) WHERE unit_id IS NULL;
UPDATE customers SET unit_id=(SELECT id FROM units WHERE code='SOROCABA' LIMIT 1) WHERE unit_id IS NULL;
UPDATE addresses SET unit_id=(SELECT id FROM units WHERE code='SOROCABA' LIMIT 1) WHERE unit_id IS NULL;
UPDATE containers SET unit_id=(SELECT id FROM units WHERE code='SOROCABA' LIMIT 1) WHERE unit_id IS NULL;
UPDATE container_assets SET unit_id=(SELECT id FROM units WHERE code='SOROCABA' LIMIT 1) WHERE unit_id IS NULL;
UPDATE rentals SET unit_id=(SELECT id FROM units WHERE code='SOROCABA' LIMIT 1) WHERE unit_id IS NULL;
UPDATE service_orders SET unit_id=(SELECT id FROM units WHERE code='SOROCABA' LIMIT 1) WHERE unit_id IS NULL;
UPDATE financial_entries SET unit_id=(SELECT id FROM units WHERE code='SOROCABA' LIMIT 1) WHERE unit_id IS NULL;
UPDATE client_requests SET unit_id=(SELECT id FROM units WHERE code='SOROCABA' LIMIT 1) WHERE unit_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_units_company ON units(company_id);
CREATE INDEX IF NOT EXISTS idx_users_unit ON users(unit_id);
CREATE INDEX IF NOT EXISTS idx_customers_unit ON customers(unit_id);
CREATE INDEX IF NOT EXISTS idx_addresses_unit ON addresses(unit_id);
CREATE INDEX IF NOT EXISTS idx_assets_unit ON container_assets(unit_id);
CREATE INDEX IF NOT EXISTS idx_rentals_unit ON rentals(unit_id);
CREATE INDEX IF NOT EXISTS idx_orders_unit ON service_orders(unit_id);
CREATE INDEX IF NOT EXISTS idx_finance_unit ON financial_entries(unit_id);
CREATE INDEX IF NOT EXISTS idx_requests_unit ON client_requests(unit_id);

CREATE OR REPLACE FUNCTION minilix_default_unit_id() RETURNS UUID AS $$
DECLARE u UUID;
BEGIN
  SELECT id INTO u FROM units WHERE code='SOROCABA' AND active=true ORDER BY created_at LIMIT 1;
  RETURN u;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION minilix_fill_unit_id() RETURNS trigger AS $$
BEGIN
  IF NEW.unit_id IS NULL THEN NEW.unit_id := minilix_default_unit_id(); END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_default_unit ON users;
CREATE TRIGGER trg_users_default_unit BEFORE INSERT ON users FOR EACH ROW EXECUTE FUNCTION minilix_fill_unit_id();
DROP TRIGGER IF EXISTS trg_customers_default_unit ON customers;
CREATE TRIGGER trg_customers_default_unit BEFORE INSERT ON customers FOR EACH ROW EXECUTE FUNCTION minilix_fill_unit_id();
DROP TRIGGER IF EXISTS trg_addresses_default_unit ON addresses;
CREATE TRIGGER trg_addresses_default_unit BEFORE INSERT ON addresses FOR EACH ROW EXECUTE FUNCTION minilix_fill_unit_id();
DROP TRIGGER IF EXISTS trg_containers_default_unit ON containers;
CREATE TRIGGER trg_containers_default_unit BEFORE INSERT ON containers FOR EACH ROW EXECUTE FUNCTION minilix_fill_unit_id();
DROP TRIGGER IF EXISTS trg_assets_default_unit ON container_assets;
CREATE TRIGGER trg_assets_default_unit BEFORE INSERT ON container_assets FOR EACH ROW EXECUTE FUNCTION minilix_fill_unit_id();
DROP TRIGGER IF EXISTS trg_rentals_default_unit ON rentals;
CREATE TRIGGER trg_rentals_default_unit BEFORE INSERT ON rentals FOR EACH ROW EXECUTE FUNCTION minilix_fill_unit_id();
DROP TRIGGER IF EXISTS trg_orders_default_unit ON service_orders;
CREATE TRIGGER trg_orders_default_unit BEFORE INSERT ON service_orders FOR EACH ROW EXECUTE FUNCTION minilix_fill_unit_id();
DROP TRIGGER IF EXISTS trg_finance_default_unit ON financial_entries;
CREATE TRIGGER trg_finance_default_unit BEFORE INSERT ON financial_entries FOR EACH ROW EXECUTE FUNCTION minilix_fill_unit_id();
DROP TRIGGER IF EXISTS trg_requests_default_unit ON client_requests;
CREATE TRIGGER trg_requests_default_unit BEFORE INSERT ON client_requests FOR EACH ROW EXECUTE FUNCTION minilix_fill_unit_id();

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('ADMIN','ATENDIMENTO','MOTORISTA')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  document TEXT,
  phone TEXT,
  email TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  cep TEXT,
  street TEXT NOT NULL,
  number TEXT NOT NULL,
  complement TEXT,
  neighborhood TEXT,
  city TEXT NOT NULL DEFAULT 'Sorocaba',
  state TEXT NOT NULL DEFAULT 'SP',
  reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS containers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  capacity_liters INTEGER NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rentals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id),
  address_id UUID NOT NULL REFERENCES addresses(id),
  scheduled_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'ABERTA' CHECK (status IN ('ABERTA','AGENDADA','EM_EXECUCAO','CONCLUIDA','CANCELADA')),
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rental_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rental_id UUID NOT NULL REFERENCES rentals(id) ON DELETE CASCADE,
  container_id UUID NOT NULL REFERENCES containers(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE SEQUENCE IF NOT EXISTS os_number_seq START 1;

CREATE TABLE IF NOT EXISTS service_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number TEXT UNIQUE NOT NULL,
  rental_id UUID NOT NULL REFERENCES rentals(id) ON DELETE CASCADE,
  driver_id UUID REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE','ATRIBUIDA','A_CAMINHO','NO_LOCAL','CONCLUIDA','CANCELADA')),
  scheduled_date DATE NOT NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  driver_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
CREATE INDEX IF NOT EXISTS idx_rentals_scheduled_date ON rentals(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_orders_scheduled_date ON service_orders(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_orders_driver ON service_orders(driver_id);

INSERT INTO containers (name, capacity_liters)
SELECT 'Tambor 200 L', 200
WHERE NOT EXISTS (SELECT 1 FROM containers WHERE capacity_liters = 200);

INSERT INTO containers (name, capacity_liters)
SELECT 'Tambor 300 L', 300
WHERE NOT EXISTS (SELECT 1 FROM containers WHERE capacity_liters = 300);

INSERT INTO containers (name, capacity_liters)
SELECT 'Tambor 500 L', 500
WHERE NOT EXISTS (SELECT 1 FROM containers WHERE capacity_liters = 500);

CREATE OR REPLACE FUNCTION enforce_service_order_status_transition()
RETURNS trigger AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'PENDENTE' AND NEW.status NOT IN ('ATRIBUIDA','CANCELADA') THEN
    RAISE EXCEPTION 'Transição de OS inválida: PENDENTE -> %', NEW.status;
  ELSIF OLD.status = 'ATRIBUIDA' AND NEW.status NOT IN ('PENDENTE','A_CAMINHO','CANCELADA') THEN
    RAISE EXCEPTION 'Transição de OS inválida: ATRIBUIDA -> %', NEW.status;
  ELSIF OLD.status = 'A_CAMINHO' AND NEW.status NOT IN ('NO_LOCAL','CANCELADA') THEN
    RAISE EXCEPTION 'Transição de OS inválida: A_CAMINHO -> %', NEW.status;
  ELSIF OLD.status = 'NO_LOCAL' AND NEW.status NOT IN ('CONCLUIDA','CANCELADA') THEN
    RAISE EXCEPTION 'Transição de OS inválida: NO_LOCAL -> %', NEW.status;
  ELSIF OLD.status IN ('CONCLUIDA','CANCELADA') THEN
    RAISE EXCEPTION 'OS finalizada não pode voltar de status: %', OLD.status;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_service_order_status_transition ON service_orders;
CREATE TRIGGER trg_service_order_status_transition
BEFORE UPDATE OF status ON service_orders
FOR EACH ROW
EXECUTE FUNCTION enforce_service_order_status_transition();

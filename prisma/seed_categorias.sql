-- Carga inicial de categorías de farmacia
-- Idempotente: usa ON CONFLICT por nombre único

BEGIN;

-- 1. Categorías raíz (sin parent)
INSERT INTO categorias (nombre, parent_id) VALUES
  ('Medicamentos',         NULL),
  ('Cuidado Personal',     NULL),
  ('Cuidado del Bebé',     NULL),
  ('Primeros Auxilios',    NULL),
  ('Dispositivos Médicos', NULL),
  ('Salud Sexual',         NULL),
  ('Nutrición y Dietética', NULL)
ON CONFLICT (nombre) DO NOTHING;

-- 2. Subcategorías de Medicamentos
INSERT INTO categorias (nombre, parent_id)
SELECT v.nombre, p.id
FROM (VALUES
  ('Analgésicos'),
  ('Antibióticos'),
  ('Antiinflamatorios'),
  ('Antihistamínicos / Alergias'),
  ('Antipiréticos'),
  ('Digestivo / Antiácidos'),
  ('Respiratorio / Antitusivos'),
  ('Cardiovascular'),
  ('Diabetes'),
  ('Dermatológicos'),
  ('Oftalmológicos'),
  ('Vitaminas y suplementos')
) AS v(nombre)
CROSS JOIN (SELECT id FROM categorias WHERE nombre = 'Medicamentos') p
ON CONFLICT (nombre) DO NOTHING;

-- 3. Subcategorías de Cuidado Personal
INSERT INTO categorias (nombre, parent_id)
SELECT v.nombre, p.id
FROM (VALUES
  ('Higiene oral'),
  ('Higiene corporal'),
  ('Cuidado capilar'),
  ('Cuidado facial'),
  ('Desodorantes'),
  ('Protección solar')
) AS v(nombre)
CROSS JOIN (SELECT id FROM categorias WHERE nombre = 'Cuidado Personal') p
ON CONFLICT (nombre) DO NOTHING;

-- 4. Subcategorías de Cuidado del Bebé
INSERT INTO categorias (nombre, parent_id)
SELECT v.nombre, p.id
FROM (VALUES
  ('Pañales'),
  ('Fórmulas lácteas'),
  ('Cremas y talcos'),
  ('Accesorios')
) AS v(nombre)
CROSS JOIN (SELECT id FROM categorias WHERE nombre = 'Cuidado del Bebé') p
ON CONFLICT (nombre) DO NOTHING;

-- 5. Subcategorías de Primeros Auxilios
INSERT INTO categorias (nombre, parent_id)
SELECT v.nombre, p.id
FROM (VALUES
  ('Vendajes y gasas'),
  ('Antisépticos'),
  ('Curitas y apósitos'),
  ('Material de curación')
) AS v(nombre)
CROSS JOIN (SELECT id FROM categorias WHERE nombre = 'Primeros Auxilios') p
ON CONFLICT (nombre) DO NOTHING;

-- 6. Subcategorías de Dispositivos Médicos
INSERT INTO categorias (nombre, parent_id)
SELECT v.nombre, p.id
FROM (VALUES
  ('Termómetros'),
  ('Tensiómetros'),
  ('Glucómetros'),
  ('Mascarillas')
) AS v(nombre)
CROSS JOIN (SELECT id FROM categorias WHERE nombre = 'Dispositivos Médicos') p
ON CONFLICT (nombre) DO NOTHING;

-- 7. Subcategorías de Salud Sexual
INSERT INTO categorias (nombre, parent_id)
SELECT v.nombre, p.id
FROM (VALUES
  ('Anticonceptivos'),
  ('Preservativos'),
  ('Pruebas de embarazo')
) AS v(nombre)
CROSS JOIN (SELECT id FROM categorias WHERE nombre = 'Salud Sexual') p
ON CONFLICT (nombre) DO NOTHING;

-- 8. Subcategorías de Nutrición y Dietética
INSERT INTO categorias (nombre, parent_id)
SELECT v.nombre, p.id
FROM (VALUES
  ('Suplementos deportivos'),
  ('Productos dietéticos'),
  ('Alimentos especiales')
) AS v(nombre)
CROSS JOIN (SELECT id FROM categorias WHERE nombre = 'Nutrición y Dietética') p
ON CONFLICT (nombre) DO NOTHING;

COMMIT;

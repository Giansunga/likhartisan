CREATE TABLE IF NOT EXISTS product_variations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  dimensions TEXT NOT NULL DEFAULT '',
  height TEXT NOT NULL DEFAULT '',
  opening_diameter TEXT NOT NULL DEFAULT '',
  price DECIMAL(10,2),
  stock INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_variations_product_id ON product_variations(product_id);

-- RLS: anyone can read variations
ALTER TABLE product_variations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read variations"
  ON product_variations FOR SELECT
  USING (true);

-- RLS: authenticated users can manage variations
CREATE POLICY "Authenticated users can manage variations"
  ON product_variations FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

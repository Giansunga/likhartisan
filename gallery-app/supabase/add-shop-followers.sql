-- Create shop_followers table for follow functionality
CREATE TABLE IF NOT EXISTS shop_followers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, shop_id)
);

ALTER TABLE shop_followers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view followers" ON shop_followers FOR SELECT USING (true);
CREATE POLICY "Users can follow" ON shop_followers FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can unfollow" ON shop_followers FOR DELETE USING (true);

CREATE INDEX idx_shop_followers_shop_id ON shop_followers(shop_id);
CREATE INDEX idx_shop_followers_user_id ON shop_followers(user_id);

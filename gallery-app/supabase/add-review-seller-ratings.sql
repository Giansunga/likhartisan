-- Add seller/delivery service ratings and show_name to product_reviews
ALTER TABLE product_reviews ADD COLUMN IF NOT EXISTS seller_service_rating INTEGER DEFAULT 0;
ALTER TABLE product_reviews ADD COLUMN IF NOT EXISTS delivery_service_rating INTEGER DEFAULT 0;
ALTER TABLE product_reviews ADD COLUMN IF NOT EXISTS show_name BOOLEAN DEFAULT true;

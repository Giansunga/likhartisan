DELETE FROM orders
WHERE id NOT IN (
  SELECT DISTINCT o.id
  FROM orders o,
       jsonb_array_elements(o.items) AS item
  WHERE item->>'product_id' IN (
    SELECT product_id::text FROM product_reviews
  )
);

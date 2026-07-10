-- Enable Supabase Realtime on messages and conversations tables
-- Run this in Supabase SQL Editor

-- Enable realtime for messages
ALTER PUBLICATION supabase_realtime ADD TABLE messages;

-- Enable realtime for conversations
ALTER PUBLICATION supabase_realtime ADD TABLE conversations;

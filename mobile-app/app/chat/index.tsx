import { useState, useEffect } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, Image, RefreshControl } from 'react-native';
import { Text, Searchbar, ActivityIndicator } from 'react-native-paper';
import { Link, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { COLORS, SPACING } from '@/constants';
import { formatTime } from '@/lib/utils';
import type { Conversation } from '@/types';

export default function ChatListScreen() {
  const { user } = useAuthStore();
  const params = useLocalSearchParams<{ shopId?: string }>();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadConversations();
  }, [user]);

  const loadConversations = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('conversations')
      .select('*')
      .eq('buyer_id', user.id)
      .order('last_message_at', { ascending: false });

    if (data) {
      setConversations(
        data.map((c: any) => ({
          id: c.id,
          buyerId: c.buyer_id,
          shopId: c.shop_id,
          shopName: c.shop_name || '',
          shopImage: c.shop_image || '',
          shopAbout: c.shop_about || '',
          lastMessage: c.last_message || '',
          lastMessageAt: c.last_message_at || c.created_at,
          buyerUnread: c.buyer_unread || 0,
          artisanUnread: c.artisan_unread || 0,
        }))
      );
    }
    setLoading(false);
    setRefreshing(false);
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadConversations();
  };

  const filtered = conversations.filter((c) =>
    c.shopName.toLowerCase().includes(search.toLowerCase())
  );

  const renderConversation = ({ item }: { item: Conversation }) => (
    <Link href={`/chat/${item.id}`} asChild>
      <TouchableOpacity style={styles.convItem}>
        {item.shopImage ? (
          <Image source={{ uri: item.shopImage }} style={styles.convAvatar} />
        ) : (
          <View style={[styles.convAvatar, styles.placeholderAvatar]}>
            <Text style={styles.placeholderText}>{item.shopName.charAt(0)}</Text>
          </View>
        )}
        <View style={styles.convInfo}>
          <View style={styles.convHeader}>
            <Text style={styles.convName} numberOfLines={1}>
              {item.shopName}
            </Text>
            <Text style={styles.convTime}>{formatTime(item.lastMessageAt)}</Text>
          </View>
          <View style={styles.convFooter}>
            <Text style={styles.convMessage} numberOfLines={1}>
              {item.lastMessage || 'Start a conversation'}
            </Text>
            {item.buyerUnread > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadText}>{item.buyerUnread}</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    </Link>
  );

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <Searchbar
          placeholder="Search conversations..."
          value={search}
          onChangeText={setSearch}
          style={styles.searchBar}
        />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderConversation}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No conversations yet</Text>
              <Text style={styles.emptySubtext}>
                Start a conversation from a shop page
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  searchContainer: {
    padding: SPACING.md,
    backgroundColor: COLORS.surface,
  },
  searchBar: {
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    padding: SPACING.sm,
  },
  convItem: {
    flexDirection: 'row',
    padding: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    marginBottom: SPACING.sm,
  },
  convAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  placeholderAvatar: {
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    color: COLORS.white,
    fontSize: 20,
    fontWeight: 'bold',
  },
  convInfo: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  convHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  convName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    flex: 1,
  },
  convTime: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  convFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  convMessage: {
    fontSize: 14,
    color: COLORS.textSecondary,
    flex: 1,
  },
  unreadBadge: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
    marginLeft: SPACING.sm,
  },
  unreadText: {
    color: COLORS.white,
    fontSize: 11,
    fontWeight: 'bold',
  },
  emptyContainer: {
    padding: SPACING.xl,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  emptySubtext: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
});

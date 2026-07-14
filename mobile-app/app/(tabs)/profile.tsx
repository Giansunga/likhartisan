import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Text, Button, Divider, List, Avatar } from 'react-native-paper';
import { Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/stores/authStore';
import { COLORS, SPACING } from '@/constants';

export default function ProfileScreen() {
  const { user, signOut } = useAuthStore();

  const menuItems = [
    { icon: 'receipt-outline' as const, label: 'My Orders', href: '/orders' as const },
    { icon: 'chatbubble-outline' as const, label: 'Messages', href: '/chat' as const },
    { icon: 'notifications-outline' as const, label: 'Notifications', href: '/(tabs)/profile' as const },
    { icon: 'heart-outline' as const, label: 'Favorites', href: '/(tabs)/gallery' as const },
  ];

  const settingsItems = [
    { icon: 'person-outline' as const, label: 'Account Settings' },
    { icon: 'location-outline' as const, label: 'Saved Addresses' },
    { icon: 'help-circle-outline' as const, label: 'Help & Support' },
    { icon: 'document-text-outline' as const, label: 'Terms & Privacy' },
  ];

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Avatar.Text
          size={80}
          label={user?.name?.charAt(0) || 'U'}
          style={styles.avatar}
          labelStyle={styles.avatarLabel}
        />
        <Text style={styles.userName}>{user?.name || 'User'}</Text>
        <Text style={styles.userEmail}>{user?.email || ''}</Text>
      </View>

      <View style={styles.menuSection}>
        {menuItems.map((item) => (
          <Link key={item.label} href={item.href} asChild>
            <TouchableOpacity style={styles.menuItem}>
              <Ionicons name={item.icon} size={24} color={COLORS.text} />
              <Text style={styles.menuLabel}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </Link>
        ))}
      </View>

      <Divider style={styles.divider} />

      <View style={styles.menuSection}>
        {settingsItems.map((item) => (
          <TouchableOpacity key={item.label} style={styles.menuItem}>
            <Ionicons name={item.icon} size={24} color={COLORS.text} />
            <Text style={styles.menuLabel}>{item.label}</Text>
            <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
          </TouchableOpacity>
        ))}
      </View>

      <Divider style={styles.divider} />

      {user?.role === 'artisan' && (
        <View style={styles.menuSection}>
          <Link href="/artisan-dashboard" asChild>
            <TouchableOpacity style={styles.menuItem}>
              <Ionicons name="storefront-outline" size={24} color={COLORS.primary} />
              <Text style={[styles.menuLabel, { color: COLORS.primary }]}>
                Artisan Dashboard
              </Text>
              <Ionicons name="chevron-forward" size={20} color={COLORS.primary} />
            </TouchableOpacity>
          </Link>
        </View>
      )}

      <Button
        mode="outlined"
        onPress={signOut}
        style={styles.logoutButton}
        textColor={COLORS.error}
      >
        Sign Out
      </Button>

      <View style={styles.footer}>
        <Text style={styles.footerText}>LikhArtisan v1.0.0</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    alignItems: 'center',
    padding: SPACING.lg,
    paddingTop: SPACING.xl,
    backgroundColor: COLORS.surface,
  },
  avatar: {
    backgroundColor: COLORS.primary,
  },
  avatarLabel: {
    fontSize: 32,
    color: COLORS.white,
  },
  userName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.text,
    marginTop: SPACING.md,
  },
  userEmail: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  menuSection: {
    backgroundColor: COLORS.surface,
    marginTop: SPACING.sm,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  menuLabel: {
    flex: 1,
    fontSize: 16,
    color: COLORS.text,
    marginLeft: SPACING.md,
  },
  divider: {
    height: 8,
    backgroundColor: COLORS.background,
  },
  logoutButton: {
    margin: SPACING.lg,
    borderColor: COLORS.error,
  },
  footer: {
    alignItems: 'center',
    padding: SPACING.lg,
  },
  footerText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
});

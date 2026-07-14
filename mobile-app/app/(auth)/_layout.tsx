import { Redirect, Stack } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { ActivityIndicator, View } from 'react-native';

export default function AuthLayout() {
  const { session, loading, initialized } = useAuthStore();

  if (!initialized || loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#C1570D" />
      </View>
    );
  }

  if (session) {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="sign-up" />
      <Stack.Screen name="forgot-password" />
    </Stack>
  );
}

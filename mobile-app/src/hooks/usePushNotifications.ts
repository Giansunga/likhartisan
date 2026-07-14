import { useEffect, useState } from 'react';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export function usePushNotifications() {
  const { user } = useAuthStore();
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);

  useEffect(() => {
    registerForPushNotifications();

    const notificationSub = Notifications.addNotificationReceivedListener((notification) => {
      console.log('Notification received:', notification);
    });

    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      console.log('Notification response:', response);
    });

    return () => {
      notificationSub.remove();
      responseSub.remove();
    };
  }, []);

  useEffect(() => {
    if (expoPushToken && user) {
      savePushToken(expoPushToken);
    }
  }, [expoPushToken, user]);

  const registerForPushNotifications = async () => {
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.log('Push notification permission not granted');
        return;
      }

      const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
      const token = await Notifications.getExpoPushTokenAsync(
        projectId ? { projectId } : undefined
      );
      setExpoPushToken(token.data);

      if (Platform.OS === 'android') {
        Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#C1570D',
        });
      }
    } catch (error) {
      console.error('Error registering for push notifications:', error);
    }
  };

  const savePushToken = async (token: string) => {
    if (!user) return;
    try {
      await supabase.from('user_devices').upsert(
        {
          user_id: user.id,
          push_token: token,
          platform: Platform.OS,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,push_token' }
      );
    } catch (error) {
      console.error('Error saving push token:', error);
    }
  };

  return { expoPushToken };
}

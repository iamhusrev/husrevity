import React from 'react';
import { Tabs, router } from 'expo-router';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { useAuth } from '../../src/auth/auth-context';

export default function TabsLayout() {
  const { logout } = useAuth();

  return (
    <Tabs
      screenOptions={{
        headerStyle: {
          backgroundColor: '#1c1917',
        },
        headerTintColor: '#fff',
        headerTitleStyle: {
          fontWeight: '600',
        },
        tabBarStyle: {
          backgroundColor: '#1c1917',
          borderTopColor: '#334155',
        },
        tabBarActiveTintColor: '#c8732e',
        tabBarInactiveTintColor: '#94a3b8',
      }}
    >
      <Tabs.Screen
        name="today"
        options={{
          title: 'Bugün',
          headerRight: () => (
            <View style={styles.headerRightContainer}>
              <TouchableOpacity
                style={styles.quickAddHeaderBtn}
                onPress={() => router.push('/quick-add')}
                accessibilityLabel="Hızlı Ekle"
              >
                <Text style={styles.quickAddHeaderBtnText}>+ Ekle</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.logoutHeaderBtn}
                onPress={() => logout()}
                accessibilityLabel="Çıkış Yap"
              >
                <Text style={styles.logoutHeaderBtnText}>Çıkış</Text>
              </TouchableOpacity>
            </View>
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  headerRightContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
  },
  quickAddHeaderBtn: {
    backgroundColor: '#c8732e',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    marginRight: 8,
  },
  quickAddHeaderBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  logoutHeaderBtn: {
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  logoutHeaderBtnText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '500',
  },
});

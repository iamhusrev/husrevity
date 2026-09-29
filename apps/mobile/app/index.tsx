import React from 'react';
import { StyleSheet, ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '../src/auth/auth-context';

export default function IndexScreen() {
  const { isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.container} testID="loading-spinner">
        <ActivityIndicator size="large" color="#c8732e" />
      </View>
    );
  }

  if (isAuthenticated) {
    return <Redirect href="/today" />;
  }

  return <Redirect href="/login" />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

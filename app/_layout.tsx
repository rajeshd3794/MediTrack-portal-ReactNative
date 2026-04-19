import { useEffect } from 'react';
import { Stack } from 'expo-router';
import Head from 'expo-router/head';
import { initDatabase } from '../db/db';
import { ActivityProvider } from '../context/ActivityContext';
import { GlobalFloatingAI } from '../components/AIAssistant';

export default function RootLayout() {
  useEffect(() => {
    initDatabase().catch((err: unknown) => console.error('Failed to initialize database:', err));
  }, []);

  return (
    <ActivityProvider>
      <Head>
        <title>Meditrack-portal | Secure Health Records</title>
        <meta name="description" content="Meditrack-portal: A secure portal for managing patient health records, doctor appointments, and live heart rate tracking. Access your medical data anywhere." />
        <meta name="keywords" content="Meditrack, Meditrack-portal, patient records, health portal, heart rate monitor, medical dashboard" />
        <meta property="og:title" content="Meditrack-portal" />
        <meta property="og:description" content="Secure and fast healthcare record management." />
        <meta property="og:url" content="https://meditrack-portal.surge.sh/" />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href="https://meditrack-portal.surge.sh/" />
      </Head>
      <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" options={{ title: 'Meditrack-portal' }} />
      <Stack.Screen name="doctor-login" options={{ title: 'Doctor Login' }} />
      <Stack.Screen name="doctor-signup" options={{ title: 'Doctor Sign Up' }} />
      <Stack.Screen name="patient-auth" options={{ title: 'Patient Portal' }} />
      <Stack.Screen name="Sign-up" options={{ title: 'Patient Sign Up' }} />
      <Stack.Screen name="dashboard" options={{ title: 'Dashboard' }} />
      <Stack.Screen name="forgot-password" options={{ title: 'Account Recovery' }} />
      <Stack.Screen name="fetch-username" options={{ title: 'Fetch Username' }} />
      <Stack.Screen name="fetch-password" options={{ title: 'Fetch Password' }} />
      <Stack.Screen name="admin-login" options={{ title: 'Admin Login' }} />
      <Stack.Screen name="admin" options={{ title: 'Admin Panel' }} />
      <Stack.Screen name="Doctors-list" options={{ title: 'Doctors List' }} />
      </Stack>
      <GlobalFloatingAI />
    </ActivityProvider>
  );
}

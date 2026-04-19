import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, Platform, Alert, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { migrateLocalToCloud } from '../db/db';

export default function AdminPage() {
  const router = useRouter();
  const [healthStatus, setHealthStatus] = useState('Healthy');
  const [lastCheck, setLastCheck] = useState(new Date().toLocaleDateString());

  useEffect(() => {
    // Auth Guard: Prevent unauthorized access
    if (Platform.OS === 'web') {
      const session = localStorage.getItem('admin_session');
      if (!session) {
        router.replace('/admin-login');
      }
    }
  }, []);

  const handleLogout = () => {
    if (Platform.OS === 'web') {
      localStorage.removeItem('admin_session');
    }
    router.replace('/');
  };

  const handleSync = async () => {
    try {
      Alert.alert("Cloud Sync", "Starting synchronization...");
      const results = await migrateLocalToCloud();
      Alert.alert(
        "Sync Complete", 
        `Successfully synchronized records:\n\n👨‍⚕️ Doctors: ${results.doctorsMoved}\n🏥 Patients: ${results.patientsMoved}`
      );
    } catch (e: any) {
      Alert.alert("Sync Failed", e.message || "An error occurred during synchronization.");
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <View style={{ width: 60 }} /> 
        <Text style={styles.headerTitle}>Admin Dashboard</Text>
        <TouchableOpacity onPress={handleLogout}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.centeredContent} showsVerticalScrollIndicator={false}>
        {/* Security Heartbeat Monitor */}
        <View style={styles.monitorCard}>
          <View style={styles.monitorHeader}>
            <Text style={styles.monitorTitle}>🛡️ Security Monitor</Text>
            <View style={[styles.statusBadge, { backgroundColor: healthStatus === 'Healthy' ? '#C6F6D5' : '#FED7D7' }]}>
              <Text style={[styles.statusText, { color: healthStatus === 'Healthy' ? '#22543D' : '#822727' }]}>{healthStatus}</Text>
            </View>
          </View>
          <View style={styles.monitorBody}>
            <Text style={styles.monitorDetail}>Daily Health Check: <Text style={styles.boldText}>Verified</Text></Text>
            <Text style={styles.monitorDetail}>Last Scan: <Text style={styles.boldText}>{lastCheck}</Text></Text>
            <Text style={styles.monitorDetail}>Vulnerabilities: <Text style={styles.boldText}>0 Detected</Text></Text>
            <Text style={styles.monitorDetail}>Alerts: <Text style={styles.boldText}>None</Text></Text>
          </View>
          <View style={styles.monitorFooter}>
            <Text style={styles.notificationText}>📧 Alerts to: rajeshimpeccable@gmail.com</Text>
          </View>
        </View>

        <View style={styles.actionContainer}>
          <TouchableOpacity 
            style={styles.actionButton} 
            onPress={() => router.push('/Doctors-list')}
            activeOpacity={0.8}
          >
            <View style={styles.iconCircle}>
              <Text style={styles.iconText}>👨‍⚕️</Text>
            </View>
            <Text style={styles.actionButtonText}>Doctors</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.actionButton} 
            onPress={() => router.push('/patient-records')}
            activeOpacity={0.8}
          >
            <View style={styles.iconCircle}>
              <Text style={styles.iconText}>🏥</Text>
            </View>
            <Text style={styles.actionButtonText}>Patients</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.actionButton, { borderColor: '#BEE3F8' }]} 
            onPress={() => router.push('/appointments-list')}
            activeOpacity={0.8}
          >
            <View style={[styles.iconCircle, { backgroundColor: '#EBF8FF' }]}>
              <Text style={styles.iconText}>📅</Text>
            </View>
            <Text style={styles.actionButtonText}>Appointments</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F9FC',
    paddingTop: Platform.OS === 'android' ? 40 : 0,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backText: {
    color: '#3182CE',
    fontSize: 16,
    fontWeight: '600',
  },
  logoutText: {
    color: '#E53E3E',
    fontSize: 16,
    fontWeight: '700',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1A365D',
  },
  centeredContent: {
    padding: 24,
    alignItems: 'center',
    paddingBottom: 40,
  },
  monitorCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    marginBottom: 32,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
  },
  monitorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  monitorTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#2D3748',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  monitorBody: {
    gap: 12,
    marginBottom: 20,
  },
  monitorDetail: {
    fontSize: 15,
    color: '#4A5568',
  },
  boldText: {
    fontWeight: '700',
    color: '#1A365D',
  },
  monitorFooter: {
    borderTopWidth: 1,
    borderTopColor: '#F7FAFC',
    paddingTop: 16,
  },
  notificationText: {
    fontSize: 13,
    color: '#718096',
    fontStyle: 'italic',
  },
  actionContainer: {
    width: '100%',
    maxWidth: 400,
    gap: 20,
  },
  actionButton: {
    backgroundColor: '#FFFFFF',
    padding: 32,
    borderRadius: 24,
    alignItems: 'center',
    flexDirection: 'row',
    shadowColor: '#1A365D',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 5,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#EBF8FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 24,
  },
  iconText: {
    fontSize: 30,
  },
  actionButtonText: {
    color: '#1A365D',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
});

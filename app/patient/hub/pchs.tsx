import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getPatientByUsername, Patient } from '../../../db/db';

export default function PatientCurrentHealthStatus() {
  const router = useRouter();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPatientData = async () => {
      try {
        const username = await AsyncStorage.getItem('logged_in_patient') || 'patient';
        const data = await getPatientByUsername(username);
        if (data) setPatient(data);
      } catch (e) {
        console.error("Failed to fetch patient data for PCHS", e);
      } finally {
        setLoading(false);
      }
    };
    fetchPatientData();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Current Health Status</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Dashboard Overview */}
        <View style={styles.dashboardCard}>
          <Text style={styles.dashboardTitle}>Daily Activity Score</Text>
          <View style={styles.scoreContainer}>
            <Text style={styles.scoreValue}>88</Text>
            <Text style={styles.scoreLabel}>Optimal</Text>
          </View>
          <View style={styles.metricsGrid}>
            <View style={styles.metricItem}>
              <Text style={styles.metricEmoji}>👣</Text>
              <Text style={styles.metricValue}>8,432</Text>
              <Text style={styles.metricLabel}>Steps</Text>
            </View>
            <View style={styles.metricItem}>
              <Text style={styles.metricEmoji}>🔥</Text>
              <Text style={styles.metricValue}>450</Text>
              <Text style={styles.metricLabel}>Kcal</Text>
            </View>
            <View style={styles.metricItem}>
              <Text style={styles.metricEmoji}>⏱️</Text>
              <Text style={styles.metricValue}>45m</Text>
              <Text style={styles.metricLabel}>Duration</Text>
            </View>
          </View>
        </View>

        {/* Alerts Section */}
        <View style={styles.alertCard}>
          <Text style={styles.alertTitle}>⚠️ Active Alerts</Text>
          <View style={styles.alertBox}>
            <Text style={styles.alertText}>High heart rate detected during morning walk (115 BPM).</Text>
          </View>
        </View>

        {/* Detailed Metrics */}
        <View style={styles.infoSection}>
          <Text style={styles.sectionTitle}>Recovery Time</Text>
          <View style={styles.metricRow}>
            <Text style={styles.metricName}>Sleep Quality</Text>
            <Text style={styles.metricStatus}>Good (7.5h)</Text>
          </View>
          <View style={styles.metricRow}>
            <Text style={styles.metricName}>Muscle Recovery</Text>
            <Text style={styles.metricStatus}>Post-workout active</Text>
          </View>

          <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Workout Consistency</Text>
          <View style={styles.constancyCard}>
            <Text style={styles.constancyText}>
              Regular daily activity improves endurance and metabolic health. You have maintained a 5-day streak!
            </Text>
          </View>

          <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Progress Metrics</Text>
          <View style={styles.progressGrid}>
            <View style={styles.progressBox}>
              <Text style={styles.progressLabel}>Strength</Text>
              <View style={styles.progressBar}><View style={[styles.progressFill, { width: '70%', backgroundColor: '#48BB78' }]} /></View>
              <Text style={styles.progressValue}>+12% vs last month</Text>
            </View>
            <View style={styles.progressBox}>
              <Text style={styles.progressLabel}>Flexibility</Text>
              <View style={styles.progressBar}><View style={[styles.progressFill, { width: '85%', backgroundColor: '#4299E1' }]} /></View>
              <Text style={styles.progressValue}>+5% vs last week</Text>
            </View>
          </View>
        </View>

        <View style={{ height: 40 }} />
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
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1A365D',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EDF2F7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 24,
    color: '#1A365D',
    fontWeight: '700',
  },
  content: {
    flex: 1,
    padding: 24,
  },
  dashboardCard: {
    backgroundColor: '#1A365D',
    borderRadius: 24,
    padding: 24,
    marginBottom: 24,
    alignItems: 'center',
  },
  dashboardTitle: {
    fontSize: 14,
    color: '#EBF8FF',
    fontWeight: '600',
    marginBottom: 16,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  scoreContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 8,
    borderColor: '#48BB78',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  scoreValue: {
    fontSize: 40,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  scoreLabel: {
    fontSize: 12,
    color: '#48BB78',
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  metricsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  metricItem: {
    alignItems: 'center',
  },
  metricEmoji: {
    fontSize: 20,
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  metricLabel: {
    fontSize: 11,
    color: '#EBF8FF',
    marginTop: 2,
  },
  alertCard: {
    backgroundColor: '#FFF5F5',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#FEB2B2',
  },
  alertTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#C53030',
    marginBottom: 8,
  },
  alertBox: {
    backgroundColor: 'rgba(197, 48, 48, 0.05)',
    padding: 12,
    borderRadius: 8,
  },
  alertText: {
    fontSize: 13,
    color: '#C53030',
    fontWeight: '600',
    lineHeight: 18,
  },
  infoSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#2D3748',
    marginBottom: 16,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F7FAFC',
  },
  metricName: {
    fontSize: 15,
    color: '#4A5568',
    fontWeight: '600',
  },
  metricStatus: {
    fontSize: 15,
    color: '#3182CE',
    fontWeight: '700',
  },
  constancyCard: {
    backgroundColor: '#F0FFF4',
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#48BB78',
  },
  constancyText: {
    fontSize: 14,
    color: '#2F855A',
    lineHeight: 20,
    fontWeight: '500',
  },
  progressGrid: {
    gap: 16,
  },
  progressBox: {
    backgroundColor: '#F7FAFC',
    padding: 16,
    borderRadius: 12,
  },
  progressLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4A5568',
    marginBottom: 8,
  },
  progressBar: {
    height: 8,
    backgroundColor: '#E2E8F0',
    borderRadius: 4,
    marginBottom: 8,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressValue: {
    fontSize: 12,
    color: '#718096',
    fontWeight: '600',
  },
});

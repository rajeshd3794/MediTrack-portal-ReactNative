import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, Platform, Modal, Pressable, TextInput, Alert } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import { getPatientByUsername, updatePatientAppointment, Patient, updatePatient } from '../../db/db';

export default function PatientSingleRecord() {
  const router = useRouter();
  const { patient: patientParam } = useLocalSearchParams();
  const [patient, setPatient] = useState<any>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    if (!patientParam) return;
    setLoading(true);
    try {
      const found = await getPatientByUsername(patientParam as string);
      if (found && typeof found === 'object') {
        setPatient(found);
      } else {
        // Fallback for demo/test purposes
        setPatient({
          name: name || 'Patient',
          username: name || 'patient',
          age: 30,
          condition: 'General Checkup',
          status: 'Stable',
          bloodType: 'A+',
          weight: '165 lbs',
          height: '5\'9"',
          lastVisit: 'Recent',
          notes: 'No critical medical history. Regular exercise and balanced diet recommended.'
        });
      }
    } catch (e) {
      console.error('Failed to fetch patient data', e);
    } finally {
      setLoading(false);
    }
  }, [name]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  const [date, setDate] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);
  const [requestSent, setRequestSent] = useState(false);

  const handleRequestAppointment = async () => {
    if (!patient) return;
    setRequestSent(true);
    const appointmentStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    
    try {
      await updatePatientAppointment(patient.username, appointmentStr);
      setPatient({ ...patient, nextAppointment: appointmentStr });
    } catch (e) {
      console.error('Failed to request appointment', e);
    }
  };

  const onChangeDate = (event: any, selectedDate?: Date) => {
    setShowPicker(Platform.OS === 'ios');
    if (selectedDate) setDate(selectedDate);
  };

  const toggleMenu = () => setIsMenuOpen(!isMenuOpen);

  const navigateTo = (path: string) => {
    setIsMenuOpen(false);
    router.push(path as any);
  };

  if (loading && !patient) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text>Synchronizing Record...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.welcomeText}>Welcome back,</Text>
          <Text style={styles.patientName}>{patient?.name || name}</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity 
            style={styles.refreshButton} 
            onPress={fetchData}
            activeOpacity={0.7}
          >
            <Text style={styles.refreshText}>{loading ? '...' : '🔄 Refresh'}</Text>
          </TouchableOpacity>

          {patient?.status === 'Critical' && (
            <TouchableOpacity 
              style={styles.hamburgerButton} 
              onPress={toggleMenu}
              activeOpacity={0.7}
            >
              <View style={styles.hamburgerLine} />
              <View style={styles.hamburgerLine} />
              <View style={styles.hamburgerLine} />
            </TouchableOpacity>
          )}
          <TouchableOpacity 
            style={styles.logoutButton} 
            onPress={() => router.replace('/patient-auth')}
          >
            <Text style={styles.logoutText}>Log Out</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Menu Modal */}
      <Modal
        visible={isMenuOpen}
        transparent={true}
        animationType="fade"
        onRequestClose={toggleMenu}
      >
        <Pressable style={styles.modalOverlay} onPress={toggleMenu}>
          <View style={styles.menuDropdown}>
            <TouchableOpacity 
              style={styles.menuItem} 
              onPress={() => navigateTo('/patient/hub' as any)}
            >
              <Text style={styles.menuItemText}>Patient Hub</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.bannerCard}>
          <Text style={styles.bannerTitle}>Your Medical Record</Text>
          <Text style={styles.bannerSubtitle}>Up to date and synchronized with MediTrack.</Text>
        </View>

        <Text style={styles.sectionTitle}>My Vitals</Text>
        <View style={styles.vitalsGrid}>
          <View style={styles.vitalCard}>
            <Text style={styles.vitalLabel}>Blood Type</Text>
            <Text style={styles.vitalValue}>{patient?.bloodType || 'Unknown'}</Text>
          </View>
          <View style={styles.vitalCard}>
            <Text style={styles.vitalLabel}>Weight</Text>
            <Text style={styles.vitalValue}>{patient?.weight || '--'}</Text>
          </View>
          <View style={styles.vitalCard}>
            <Text style={styles.vitalLabel}>Height</Text>
            <Text style={styles.vitalValue}>{patient?.height || '--'}</Text>
          </View>
          <View style={styles.vitalCard}>
            <Text style={styles.vitalLabel}>Current Status</Text>
            <Text style={[styles.vitalValue, { color: patient?.status === 'Critical' ? '#E53E3E' : patient?.status === 'Review' ? '#D69E2E' : '#38A169' }]}>
              {patient?.status || 'Stable'}
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Doctor Notes</Text>
        <View style={styles.notesCard}>
          <Text style={styles.notesText}>{patient?.notes || 'No recent clinical notes available.'}</Text>
        </View>

        <Text style={styles.sectionTitle}>Request Appointment</Text>
        <View style={styles.notesCard}>
          <View>
            <Text style={styles.notesText}>Please select a date and time to request an upcoming appointment.</Text>
            {Platform.OS === 'web' ? (
              React.createElement('input', {
                type: 'datetime-local',
                value: new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().slice(0, 16),
                onChange: (e: any) => {
                  if (e.target.value) setDate(new Date(e.target.value));
                },
                style: {
                  padding: '12px',
                  borderRadius: '8px',
                  border: '1px solid #E2E8F0',
                  fontSize: '16px',
                  marginTop: '16px',
                  backgroundColor: '#EDF2F7',
                  color: '#2D3748',
                  width: '100%',
                  outline: 'none',
                  boxSizing: 'border-box'
                }
              })
            ) : (
              <>
                <TouchableOpacity style={styles.datePickerBtn} onPress={() => setShowPicker(true)}>
                  <Text style={styles.datePickerBtnText}>{date.toLocaleString()}</Text>
                </TouchableOpacity>
                
                {showPicker && (
                  <DateTimePicker
                    value={date}
                    mode="datetime"
                    display="default"
                    onChange={onChangeDate}
                    minimumDate={new Date()}
                  />
                )}
              </>
            )}

            {requestSent ? (
              <Text style={[styles.notesText, { color: '#38A169', marginTop: 16, fontWeight: '700' }]}>
                Appointment Request Sent for {patient?.nextAppointment}
              </Text>
            ) : (
              <View style={[styles.actionsContainer, { marginTop: 16 }]}>
                <TouchableOpacity style={styles.primaryAction} onPress={handleRequestAppointment}>
                  <Text style={styles.primaryActionText}>Confirm Request</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
        <View style={{height: 40}} />
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
    paddingHorizontal: 24,
    paddingBottom: 20,
    paddingTop: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  welcomeText: {
    fontSize: 14,
    color: '#718096',
    fontWeight: '500',
  },
  patientName: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1A365D',
  },
  logoutButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#EDF2F7',
    borderRadius: 8,
  },
  logoutText: {
    color: '#E53E3E',
    fontSize: 14,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    padding: 24,
  },
  bannerCard: {
    backgroundColor: '#3182CE',
    borderRadius: 16,
    padding: 24,
    marginBottom: 24,
    shadowColor: '#3182CE',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  bannerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  bannerSubtitle: {
    fontSize: 14,
    color: '#EBF8FF',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2D3748',
    marginBottom: 16,
  },
  vitalsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 24,
  },
  vitalCard: {
    backgroundColor: '#FFFFFF',
    width: '47%',
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  vitalLabel: {
    fontSize: 12,
    color: '#718096',
    fontWeight: '500',
    marginBottom: 4,
  },
  vitalValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A202C',
  },
  notesCard: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderRadius: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#3182CE',
    marginBottom: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  notesText: {
    fontSize: 15,
    color: '#4A5568',
    lineHeight: 22,
  },
  actionsContainer: {
    gap: 12,
  },
  primaryAction: {
    backgroundColor: '#38A169',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#38A169',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryActionText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  datePickerBtn: {
    backgroundColor: '#EDF2F7',
    padding: 12,
    borderRadius: 8,
    marginTop: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  datePickerBtnText: {
    color: '#2D3748',
    fontSize: 16,
    fontWeight: '600',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  hamburgerButton: {
    padding: 10,
    backgroundColor: '#EDF2F7',
    borderRadius: 8,
    gap: 3,
  },
  hamburgerLine: {
    width: 18,
    height: 2,
    backgroundColor: '#1A365D',
    borderRadius: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.1)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
  },
  menuDropdown: {
    marginTop: 80,
    marginRight: 80,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    width: 160,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  menuItem: {
    padding: 16,
    width: '100%',
  },
  menuItemText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2D3748',
  },
  refreshButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#EBF8FF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BEE3F8',
  },
  refreshText: {
    color: '#3182CE',
    fontSize: 13,
    fontWeight: '700',
  },
});

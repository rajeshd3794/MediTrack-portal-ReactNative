import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, Platform, Modal, Pressable, TextInput, Alert } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import { getPatientByUsername, updatePatientAppointment, getAllPatients, Patient, updatePatient } from '../db/db';

export default function PatientRecords() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [patient, setPatient] = useState<any>(null);
  const [allPatients, setAllPatients] = useState<Patient[]>([]);
  const [viewMode, setViewMode] = useState<'single' | 'tabular'>('tabular');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editingRowId, setEditingRowId] = useState<string | number | null>(null);
  const [rowForm, setRowForm] = useState<Partial<Patient>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    const storedName = params.name as string;
    
    try {
      // 1. Fetch All Patients (always needed for tabular or verification)
      const all = await getAllPatients();
      setAllPatients(all);

      if (storedName) {
        setViewMode('single');
        // 2. Fetch specific patient
        const found = await getPatientByUsername(storedName);
        if (found) {
          setPatient(found);
        } else {
          // Fallback if not found in cloud
          setPatient({
            name: storedName || 'John Doe',
            username: storedName || 'patient',
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
      } else {
        setViewMode('tabular');
        setPatient(null);
      }
    } catch (e) {
      console.error('Failed to fetch data', e);
    } finally {
      setLoading(false);
    }
  }, [params.name]);

  // Handle focus (navigation backward)
  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  // Handle real-time polling
  useEffect(() => {
    const interval = setInterval(fetchData, 15000); 
    return () => clearInterval(interval);
  }, [fetchData]);

  const [date, setDate] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);
  const [requestSent, setRequestSent] = useState(false);

  const handleRequestAppointment = async () => {
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

  const handleStartEdit = (p: Patient) => {
    setEditingRowId(p.username);
    setRowForm({ ...p });
  };

  const handleCancelEdit = () => {
    setEditingRowId(null);
    setRowForm({});
  };

  const handleSaveRow = async () => {
    if (!rowForm.username) return;
    try {
      setLoading(true);
      await updatePatient(rowForm as Patient);
      setEditingRowId(null);
      await fetchData();
      Alert.alert("Success", "Patient record updated successfully.");
    } catch (e) {
      console.error("Failed to update patient", e);
      Alert.alert("Error", "Failed to update record. Please check your connection.");
    } finally {
      setLoading(false);
    }
  };

  const toggleMenu = () => setIsMenuOpen(!isMenuOpen);

  const navigateTo = (path: string) => {
    setIsMenuOpen(false);
    router.push(path as any);
  };

  if (loading && !patient && allPatients.length === 0) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text>Synchronizing Cloud Records...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.welcomeText}>
            {viewMode === 'single' ? 'Welcome back,' : 'System Records'}
          </Text>
          <Text style={styles.patientName}>
            {viewMode === 'single' ? patient?.name : 'Patient Database'}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity 
            style={styles.refreshButton} 
            onPress={fetchData}
            activeOpacity={0.7}
          >
            <Text style={styles.refreshText}>{loading ? '...' : '🔄 Refresh'}</Text>
          </TouchableOpacity>

          {viewMode === 'single' && patient?.status === 'Critical' && (
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
            onPress={() => router.replace(viewMode === 'tabular' ? '/admin' : '/patient-auth')}
          >
            <Text style={styles.logoutText}>{viewMode === 'tabular' ? 'Exit' : 'Log Out'}</Text>
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
        
        {viewMode === 'tabular' ? (
          <>
            <View style={styles.bannerCard}>
              <Text style={styles.bannerTitle}>Clinical Database Sync</Text>
              <Text style={styles.bannerSubtitle}>Viewing {allPatients.length} live patient records from Cloud.</Text>
            </View>

            <Text style={styles.sectionTitle}>Detailed Records Table</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={true}>
              <View style={styles.tableContainer}>
                {/* Header */}
                <View style={styles.tableRowHeader}>
                  <Text style={[styles.col, styles.colId]}>ID</Text>
                  <Text style={[styles.col, styles.colName]}>Name</Text>
                  <Text style={[styles.col, styles.colUser]}>Username</Text>
                  <Text style={[styles.col, styles.colEmail]}>Email</Text>
                  <Text style={[styles.col, styles.colDob]}>DOB</Text>
                  <Text style={[styles.col, styles.colPass]}>Password</Text>
                  <Text style={[styles.col, styles.colAppt]}>Next Appt</Text>
                  <Text style={[styles.col, styles.colAge]}>Age</Text>
                  <Text style={[styles.col, styles.colCond]}>Condition</Text>
                  <Text style={[styles.col, styles.colStat]}>Status</Text>
                  <Text style={[styles.col, styles.colAction]}>Action</Text>
                </View>

                {/* Body */}
                {allPatients.map((p: Patient, idx: number) => {
                  const isEditing = editingRowId === p.username;
                  return (
                    <View key={p.id || p.username || idx} style={styles.tableRow}>
                      <Text style={[styles.col, styles.colId]}>{p.id || '-'}</Text>
                      
                      <View style={styles.colName}>
                        {isEditing ? (
                          <TextInput 
                            style={styles.inlineInput} 
                            value={rowForm.name} 
                            onChangeText={(t) => setRowForm({...rowForm, name: t})} 
                          />
                        ) : (
                          <TouchableOpacity onPress={() => router.push({ pathname: '/patient-records', params: { name: p.username } })}>
                            <Text style={{ fontWeight: '700', color: '#2D3748' }}>{p.name}</Text>
                          </TouchableOpacity>
                        )}
                      </View>

                      <View style={styles.colUser}>
                        <Text style={{ fontSize: 13 }}>{p.username}</Text>
                      </View>

                      <View style={styles.colEmail}>
                        {isEditing ? (
                          <TextInput 
                            style={styles.inlineInput} 
                            value={rowForm.email} 
                            onChangeText={(t) => setRowForm({...rowForm, email: t})} 
                          />
                        ) : (
                          <Text style={{ fontSize: 13 }}>{p.email}</Text>
                        )}
                      </View>

                      <View style={styles.colDob}>
                        {isEditing ? (
                          <TextInput 
                            style={styles.inlineInput} 
                            value={rowForm.dob} 
                            onChangeText={(t) => setRowForm({...rowForm, dob: t})} 
                          />
                        ) : (
                          <Text style={{ fontSize: 13 }}>{p.dob}</Text>
                        )}
                      </View>

                      <View style={styles.colPass}>
                        {isEditing ? (
                          <TextInput 
                            style={styles.inlineInput} 
                            value={rowForm.password} 
                            onChangeText={(t) => setRowForm({...rowForm, password: t})} 
                          />
                        ) : (
                          <Text style={{ color: '#CBD5E0' }}>••••••</Text>
                        )}
                      </View>

                      <View style={styles.colAppt}>
                        {isEditing ? (
                          <TextInput 
                            style={styles.inlineInput} 
                            value={rowForm.nextAppointment} 
                            onChangeText={(t) => setRowForm({...rowForm, nextAppointment: t})} 
                          />
                        ) : (
                          <Text style={{ fontSize: 13 }}>{p.nextAppointment || 'None'}</Text>
                        )}
                      </View>

                      <View style={styles.colAge}>
                        {isEditing ? (
                          <TextInput 
                            style={styles.inlineInput} 
                            value={String(rowForm.age || '')} 
                            keyboardType="numeric"
                            onChangeText={(t) => setRowForm({...rowForm, age: parseInt(t) || 0})} 
                          />
                        ) : (
                          <Text style={{ fontSize: 13 }}>{p.age || '-'}</Text>
                        )}
                      </View>

                      <View style={styles.colCond}>
                        {isEditing ? (
                          <TextInput 
                            style={styles.inlineInput} 
                            value={rowForm.condition} 
                            onChangeText={(t) => setRowForm({...rowForm, condition: t})} 
                          />
                        ) : (
                          <Text style={{ fontSize: 13 }}>{p.condition || '-'}</Text>
                        )}
                      </View>

                      <View style={styles.colStat}>
                        {isEditing ? (
                          <TextInput 
                            style={styles.inlineInput} 
                            value={rowForm.status} 
                            onChangeText={(t) => setRowForm({...rowForm, status: t})} 
                          />
                        ) : (
                          <Text style={{ fontWeight: '800', fontSize: 13, color: p.status === 'Critical' ? '#E53E3E' : p.status === 'Review' ? '#D69E2E' : '#38A169' }}>
                            {p.status || 'Stable'}
                          </Text>
                        )}
                      </View>

                      <View style={[styles.col, styles.colAction, { flexDirection: 'row', gap: 8 }]}>
                        {isEditing ? (
                          <>
                            <TouchableOpacity onPress={handleSaveRow}>
                              <Text style={{ color: '#38A169', fontWeight: '800' }}>Save</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={handleCancelEdit}>
                              <Text style={{ color: '#E53E3E', fontWeight: '700' }}>X</Text>
                            </TouchableOpacity>
                          </>
                        ) : (
                          <TouchableOpacity onPress={() => handleStartEdit(p)}>
                            <Text style={{ color: '#3182CE', fontWeight: '700' }}>Edit</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          </>
        ) : (
          <>
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
          </>
        )}

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
  disabledAction: {
    backgroundColor: '#A0AEC0',
    shadowOpacity: 0,
    elevation: 0,
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
  tableContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  tableRowHeader: {
    flexDirection: 'row',
    backgroundColor: '#EDF2F7',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingVertical: 12,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#F7FAFC',
    paddingVertical: 12,
  },
  col: {
    fontSize: 13,
    color: '#4A5568',
    paddingHorizontal: 12,
  },
  colId: { width: 40 },
  colName: { width: 140, fontWeight: '700', color: '#2D3748' },
  colUser: { width: 100 },
  colEmail: { width: 180 },
  colDob: { width: 100 },
  colPass: { width: 100 },
  colAppt: { width: 140 },
  colAge: { width: 60 },
  colCond: { width: 140 },
  colStat: { width: 90 },
  colAction: { width: 80 },
  inlineInput: {
    borderBottomWidth: 1,
    borderBottomColor: '#3182CE',
    fontSize: 12,
    color: '#2D3748',
    padding: 2,
    width: '90%',
  },
});

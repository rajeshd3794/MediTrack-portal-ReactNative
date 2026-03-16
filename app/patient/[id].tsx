import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, Platform, TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { getPatientByUsername, updatePatient } from '../../db/db';

export default function PatientProfile() {
  const { id, status: paramStatus } = useLocalSearchParams();
  const router = useRouter();
  const [patient, setPatient] = useState<any>(null);
  
  // Edit State
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>({});

  useEffect(() => {
    // Fetch the specific patient by username (id) from SQLite.
    const fetchPatient = async () => {
      try {
        const found = await getPatientByUsername(id as string);
        if (found) {
          setPatient(found);
          return;
        }
      } catch (e) {
        console.error('Failed to fetch patient', e);
      }
      
      // Fallback dummy data if not found in storage
      setPatient({
        id: id || '1',
        name: id || 'John Doe',
        username: id || 'patient',
        age: 45,
        condition: 'Hypertension',
        status: 'Stable',
        bloodType: 'O+',
        weight: '185 lbs',
        height: '5\'10"',
        lastVisit: 'Sept 28, 2023',
        notes: 'Patient reports mild headaches in the morning. Blood pressure is currently managed well with medication. Advised to reduce sodium intake.'
      });
    };

    fetchPatient();
  }, [id]);

  // Sync edit form whenever patient updates
  useEffect(() => {
    if (patient) {
      setEditForm(patient);
    }
  }, [patient]);

  const handleSave = async () => {
    try {
      await updatePatient(editForm);
      setPatient(editForm);
      setIsEditing(false);
      if (Platform.OS !== 'web') {
        alert('Patient records updated successfully!');
      }
    } catch (e) {
      console.error('Failed to save edits', e);
    }
  };

  if (!patient) return null;

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'Stable': return '#48BB78';
      case 'Review': return '#ECC94B';
      case 'Critical': return '#F56565';
      case 'New': return '#3182CE';
      default: return '#A0AEC0';
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backText}>← Back to Dashboard</Text>
        </TouchableOpacity>
        {isEditing ? (
          <View style={{flexDirection: 'row', gap: 8}}>
            <TouchableOpacity style={styles.cancelButton} onPress={() => {
              setEditForm(patient); // reset
              setIsEditing(false);
            }}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
              <Text style={styles.saveText}>Save</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.editButton} onPress={() => setIsEditing(true)}>
            <Text style={styles.editText}>Edit</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        
        {/* Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.avatarContainer}>
            <Text style={styles.avatarText}>
              {patient.name.split(' ').map((n: string) => n[0]).join('')}
            </Text>
          </View>
          {isEditing ? (
            <TextInput
              style={[styles.patientName, styles.editInputName]}
              value={editForm.name || ''}
              onChangeText={(t) => setEditForm({...editForm, name: t})}
              placeholder="Full Name"
            />
          ) : (
            <Text style={styles.patientName}>{patient.name}</Text>
          )}
          <Text style={styles.patientCondition}>{patient.condition}</Text>
          
          <View style={styles.tagsContainer}>
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(patient.status) + '20' }]}>
              <View style={[styles.statusDot, { backgroundColor: getStatusColor(patient.status) }]} />
              <Text style={[styles.statusText, { color: getStatusColor(patient.status) }]}>{patient.status}</Text>
            </View>
            <View style={styles.ageBadge}>
              <Text style={styles.ageText}>{patient.age} yrs</Text>
            </View>
          </View>
        </View>

        {/* Vitals Grid */}
        <Text style={styles.sectionTitle}>Vitals & Info</Text>
        <View style={styles.vitalsGrid}>
          <View style={styles.vitalCard}>
            <Text style={styles.vitalLabel}>Blood Type</Text>
            {isEditing ? (
               <TextInput 
                 style={styles.editInput} 
                 value={editForm.bloodType || ''} 
                 onChangeText={(t) => setEditForm({...editForm, bloodType: t})}
                 placeholder="O+" 
               />
            ) : (
               <Text style={styles.vitalValue}>{patient.bloodType || 'Unknown'}</Text>
            )}
          </View>
          <View style={styles.vitalCard}>
            <Text style={styles.vitalLabel}>Weight</Text>
            {isEditing ? (
               <TextInput 
                 style={styles.editInput} 
                 value={editForm.weight || ''} 
                 onChangeText={(t) => setEditForm({...editForm, weight: t})}
                 placeholder="180 lbs" 
               />
            ) : (
               <Text style={styles.vitalValue}>{patient.weight || '--'}</Text>
            )}
          </View>
          <View style={styles.vitalCard}>
            <Text style={styles.vitalLabel}>Height</Text>
            {isEditing ? (
               <TextInput 
                 style={styles.editInput} 
                 value={editForm.height || ''} 
                 onChangeText={(t) => setEditForm({...editForm, height: t})}
                 placeholder="5'10" 
               />
            ) : (
               <Text style={styles.vitalValue}>{patient.height || '--'}</Text>
            )}
          </View>
          <View style={styles.vitalCard}>
            <Text style={styles.vitalLabel}>Current Status</Text>
            {isEditing ? (
               <TextInput 
                 style={[styles.editInput, styles.editInputStatus]} 
                 value={editForm.status || ''} 
                 onChangeText={(t) => setEditForm({...editForm, status: t})}
                 placeholder="Stable/Critical"
                 autoCapitalize="words"
               />
            ) : (
               <Text style={[styles.vitalValue, {color: getStatusColor(patient.status)}]}>{patient.status || 'Stable'}</Text>
            )}
          </View>
        </View>

        {/* Medical Notes */}
        <Text style={styles.sectionTitle}>Clinical Notes</Text>
        <View style={styles.notesCard}>
          {isEditing ? (
             <TextInput 
               style={styles.editNotesInput} 
               value={editForm.notes || ''} 
               onChangeText={(t) => setEditForm({...editForm, notes: t})}
               placeholder="Notes..." 
               multiline
             />
          ) : (
             <Text style={styles.notesText}>{patient.notes || 'No recent clinical notes available for this patient.'}</Text>
          )}
        </View>

        {/* Action Buttons */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity 
            style={styles.primaryAction}
            onPress={() => router.push({
              pathname: '/patient-history',
              params: { username: patient.username, name: patient.name }
            })}
          >
            <Text style={styles.primaryActionText}>View Full History</Text>
          </TouchableOpacity>
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
    paddingBottom: 16,
    paddingTop: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backButton: {
    paddingVertical: 8,
  },
  backText: {
    fontSize: 16,
    color: '#3182CE',
    fontWeight: '600',
  },
  editButton: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    backgroundColor: '#EDF2F7',
    borderRadius: 8,
  },
  editText: {
    fontSize: 14,
    color: '#4A5568',
    fontWeight: '600',
  },
  cancelButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  cancelText: {
    fontSize: 14,
    color: '#A0AEC0',
    fontWeight: '600',
  },
  saveButton: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    backgroundColor: '#38A169',
    borderRadius: 8,
  },
  saveText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  content: {
    flex: 1,
    padding: 24,
  },
  profileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  avatarContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#EBF8FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarText: {
    fontSize: 28,
    fontWeight: '700',
    color: '#3182CE',
  },
  patientName: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1A365D',
    marginBottom: 4,
  },
  patientCondition: {
    fontSize: 16,
    color: '#718096',
    marginBottom: 16,
  },
  tagsContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '700',
  },
  ageBadge: {
    backgroundColor: '#EDF2F7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  ageText: {
    color: '#4A5568',
    fontSize: 13,
    fontWeight: '600',
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
    backgroundColor: '#FFFBEB',
    padding: 20,
    borderRadius: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#F6E05E',
    marginBottom: 32,
  },
  notesText: {
    fontSize: 15,
    color: '#744210',
    lineHeight: 22,
  },
  editInput: {
    borderBottomWidth: 1,
    borderBottomColor: '#CBD5E0',
    fontSize: 16,
    fontWeight: '600',
    color: '#1A202C',
    paddingVertical: 4,
  },
  editNotesInput: {
    fontSize: 15,
    color: '#744210',
    lineHeight: 22,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  editInputName: {
    borderBottomWidth: 1,
    borderBottomColor: '#3182CE',
    minWidth: 200,
    textAlign: 'center',
    paddingVertical: 2,
  },
  editInputStatus: {
    borderBottomColor: '#F56565', // Red border for status editing
    borderBottomWidth: 2,
    color: '#F56565',
    fontWeight: '700',
  },
  actionsContainer: {
    gap: 12,
  },
  primaryAction: {
    backgroundColor: '#3182CE',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#3182CE',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  disabledAction: {
    backgroundColor: '#A0AEC0',
    shadowOpacity: 0,
    elevation: 0,
  },
  primaryActionText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryAction: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  secondaryActionText: {
    color: '#4A5568',
    fontSize: 16,
    fontWeight: '600',
  }
});

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAllPatients, Patient, getDoctorByUsername } from '../db/db';

// Comprehensive mock data
const initialPatients = [
  { id: '1', name: 'John Doe', age: 45, nextAppointment: 'Oct 15, 10:00 AM', status: 'Stable', condition: 'Hypertension' },
  { id: '2', name: 'Maria Garcia', age: 32, nextAppointment: 'Oct 16, 02:30 PM', status: 'Review', condition: 'Type 2 Diabetes' },
  { id: '3', name: 'Robert Smith', age: 58, nextAppointment: 'Oct 18, 09:15 AM', status: 'Critical', condition: 'Coronary Artery Disease' },
  { id: '4', name: 'Sarah Johnson', age: 29, nextAppointment: 'Oct 20, 11:45 AM', status: 'Stable', condition: 'Asthma' },
  { id: '5', name: 'William Davis', age: 64, nextAppointment: 'Oct 21, 01:00 PM', status: 'Review', condition: 'Osteoarthritis' },
];

export default function Dashboard() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const [patients, setPatients] = useState<any[]>(initialPatients);
  const [completedAppts, setCompletedAppts] = useState<any[]>([]);
  const [activeApptsToday, setActiveApptsToday] = useState(0);
  const [nextDayApptsCount, setNextDayApptsCount] = useState(0);
  const [activeView, setActiveView] = useState<'recent' | 'completed' | 'nextDay'>('recent');
  
  const [doctorDisplay, setDoctorDisplay] = useState(params.doctorName as string || 'Doctor');
  const [loading, setLoading] = useState(true);

  // Session verification & Name fetching
  useEffect(() => {
    const verifySession = async () => {
      try {
        const storedUser = await AsyncStorage.getItem('logged_in_doctor');
        if (!storedUser) {
          router.replace('/doctor-login');
          return;
        }

        const doctor = await getDoctorByUsername(storedUser);
        if (doctor) {
          setDoctorDisplay(`Dr. ${doctor.firstName} ${doctor.lastName}`);
        } else {
          // Username in storage but not in DB? Clear it.
          await AsyncStorage.removeItem('logged_in_doctor');
          router.replace('/doctor-login');
        }
      } catch (e) {
        console.error("Session verification failed", e);
      } finally {
        setLoading(false);
      }
    };
    verifySession();
  }, []);

  const handleLogout = async () => {
    try {
      await AsyncStorage.removeItem('logged_in_doctor');
      router.replace('/doctor-login');
    } catch (e) {
      console.error("Failed to logout", e);
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (loading) return;
      const fetchStoredPatients = async () => {
        try {
          const storedPatients = await getAllPatients();
          setPatients(prev => {
            const newArray = [...storedPatients, ...initialPatients];
            // Filter by name to avoid duplicates between initial and stored
            const unique = newArray.filter((v, i, a) => a.findIndex(t => (t.name === v.name)) === i);
            return unique;
          });
        } catch(e) {
          console.error("Failed to load patients from database", e);
        }
      };
      fetchStoredPatients();
      
      // Also fetch completed appts on focus
      const fetchCompleted = async () => {
        try {
          const storedCompleted = await AsyncStorage.getItem('meditrack_completed_appts');
          if (storedCompleted) {
            setCompletedAppts(JSON.parse(storedCompleted));
          }
        } catch(e) {}
      };
      fetchCompleted();
    }, [loading])
  );

  // Parse total active appointments
  useEffect(() => {
    let today = 0;
    let nextDay = 0;
    
    patients.forEach(p => {
      if (p.nextAppointment && p.nextAppointment !== 'Pending' && p.nextAppointment !== 'Completed' && p.nextAppointment !== 'None') {
        const apptTime = new Date(p.nextAppointment).getTime();
        // Categorize appointments more than 24hrs away as 'Next Day'
        if (!isNaN(apptTime) && apptTime > Date.now() + 86400000) {
          nextDay++;
        } else {
          today++;
        }
      }
    });
    setActiveApptsToday(today);
    setNextDayApptsCount(nextDay);
  }, [patients]);
  
  // Real-time Lifecycle Monitor: Polls every 10 seconds to auto-expire appointments
  // Since we don't have true timestamp records for the mock initial data, we'll simulate
  // by expiring any strictly formatted 'MM/DD/YYYY, HH:MM' string that is > 30 mins old.
  useEffect(() => {
    const checkApptExpirations = async () => {
      let patientsChanged = false;
      const updatedPatients = [...patients];
      const newlyCompleted: any[] = [];
      const now = Date.now();

      for (let i = 0; i < updatedPatients.length; i++) {
        const p = updatedPatients[i];
        if (p.nextAppointment && p.nextAppointment.includes(':')) {
          // Attempt to parse Date. The Request flow creates string like "10/24/2023, 10:30 AM"
          const apptTime = new Date(p.nextAppointment).getTime();
          // If the parsed date is valid AND it's been more than 30 minutes (1800000 ms) in the past
          if (!isNaN(apptTime) && (now - apptTime > 1800000)) {
            newlyCompleted.push({...p, completedAt: now});
            updatedPatients[i] = { ...p, nextAppointment: 'Completed' };
            patientsChanged = true;
          }
        }
      }

      if (patientsChanged) {
        setPatients(updatedPatients);
        
        try {
          // Flush to async storage
          await AsyncStorage.setItem('meditrack_patients', JSON.stringify(updatedPatients.filter(up => !initialPatients.find(ip => ip.id === up.id))));
          
          const storedCompleted = await AsyncStorage.getItem('meditrack_completed_appts');
          const existingCompleted = storedCompleted ? JSON.parse(storedCompleted) : [];
          const updatedCompleted = [...newlyCompleted, ...existingCompleted];
          
          await AsyncStorage.setItem('meditrack_completed_appts', JSON.stringify(updatedCompleted));
          setCompletedAppts(updatedCompleted);
        } catch (e) {
          console.error("Failed to migrate completed appointments", e);
        }
      }
    };

    const interval = setInterval(checkApptExpirations, 10000); // Polling every 10 seconds for demo responsiveness
    return () => clearInterval(interval);
  }, [patients]);

  useEffect(() => {
    // If a new patient was passed in the URL, dynamically insert them into the array
    if (params.newPatientName) {
      const newPatient = {
        id: Math.random().toString(),
        name: params.newPatientName as string,
        age: parseInt((params.newPatientAge as string) || '30', 10),
        nextAppointment: 'Pending',
        status: 'New',
        condition: (params.newPatientCondition as string) || 'General Checkup'
      };
      
      setPatients(prev => {
        // Prevent duplicate insertion if component remounts
        if (prev.find(p => p.name === newPatient.name)) return prev;
        return [newPatient, ...prev];
      });
    }
  }, [params.newPatientName]);

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'Stable': return '#48BB78'; // Green
      case 'Review': return '#ECC94B'; // Yellow
      case 'Critical': return '#F56565'; // Red
      case 'New': return '#3182CE'; // Blue
      default: return '#A0AEC0'; // Gray
    }
  };

  const getDisplayedPatients = () => {
    let list = [];
    if (activeView === 'completed') {
      list = [...completedAppts];
    } else if (activeView === 'nextDay') {
      list = patients.filter(p => {
        if (!p.nextAppointment || p.nextAppointment === 'Pending' || p.nextAppointment === 'Completed' || p.nextAppointment === 'None') return false;
        const apptTime = new Date(p.nextAppointment).getTime();
        return !isNaN(apptTime) && apptTime > Date.now() + 86400000;
      });
    } else {
      list = [...patients];
    }

    // Sort priority: Review (1) > Critical (2) > Stable (3) > Others (4)
    const priority: any = { 'Review': 1, 'Critical': 2, 'Stable': 3 };
    
    return list.sort((a, b) => {
      const pA = priority[a.status] || 4;
      const pB = priority[b.status] || 4;
      if (pA !== pB) return pA - pB;
      // Secondary sort by timestamp if available
      return (b.timestamp || 0) - (a.timestamp || 0);
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Good Morning,</Text>
          <Text style={styles.title}>{doctorDisplay}</Text>
        </View>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        
        {/* Horizontal Stats Row */}
        <View style={{marginBottom: 32}}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statsRow}>
            <TouchableOpacity style={styles.statCard} onPress={() => setActiveView('recent')}>
              <Text style={styles.statNumber}>{patients.length > initialPatients.length ? 19 + patients.length : 24}</Text>
              <Text style={styles.statLabel}>Total Patients</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.statCard}
              onPress={() => router.push('/appointments')}
            >
              <Text style={styles.statNumber}>{activeApptsToday}</Text>
              <Text style={styles.statLabel}>Today's Appts</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.statCard} onPress={() => setActiveView('nextDay')}>
              <Text style={[styles.statNumber, { color: '#D69E2E' }]}>{nextDayApptsCount}</Text>
              <Text style={styles.statLabel}>Next Day Appts</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.statCard} onPress={() => setActiveView('completed')}>
              <Text style={[styles.statNumber, { color: '#38A169' }]}>{completedAppts.length}</Text>
              <Text style={styles.statLabel}>Completed</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.statCard} 
              onPress={() => {
                setActiveView('recent');
                // Optional: filter for critical only if desired, but user just asked for the count
              }}
            >
              <Text style={[styles.statNumber, { color: '#E53E3E' }]}>
                {completedAppts.filter(p => p.status === 'Critical').length}
              </Text>
              <Text style={styles.statLabel}>Critical</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            {activeView === 'recent' ? 'Recent Patients' : 
             activeView === 'completed' ? 'Completed Appointments' : 
             'Next Day Appointments'}
          </Text>
          <TouchableOpacity onPress={() => setActiveView('recent')}>
            <Text style={styles.seeAllText}>Reset View</Text>
          </TouchableOpacity>
        </View>

        {/* Patient List View (Dynamically switches based on Stat Card clicks) */}
        <View style={styles.patientList}>
          {getDisplayedPatients().length === 0 ? (
            <Text style={{color: '#718096', textAlign: 'center', marginTop: 20, fontStyle: 'italic'}}>No patient records found in this view.</Text>
          ) : getDisplayedPatients().map((patient: any, idx: number) => (
            <TouchableOpacity 
              key={patient.id || `patient-${idx}`} 
              style={styles.patientCard}
              onPress={() => router.push({
                pathname: `/patient/${patient.name}`,
                params: { status: patient.status }
              } as any)}
            >
              <View style={styles.patientAvatarContainer}>
                <Text style={styles.patientInitials}>
                  {patient.name?.split(' ').map((n: string) => n[0]).join('') || 'U'}
                </Text>
              </View>
              <View style={styles.patientInfo}>
                <Text style={styles.patientName}>{patient.name}</Text>
                <Text style={styles.patientDetails}>
                  {patient.age} yrs • {patient.condition}
                </Text>
                <Text style={styles.patientAppointment}>
                  📅 {activeView === 'completed' ? 'Completed at: ' + new Date(patient.completedAt || Date.now()).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : patient.nextAppointment}
                </Text>
              </View>
              <View style={styles.statusBadgeContainer}>
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(patient.status) + '20' }]}>
                  <View style={[styles.statusDot, { backgroundColor: getStatusColor(patient.status) }]} />
                  <Text style={[styles.statusText, { color: getStatusColor(patient.status) }]}>
                    {patient.status}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
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
    paddingHorizontal: 24,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  greeting: {
    fontSize: 14,
    color: '#718096',
    fontWeight: '500',
  },
  title: {
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
    color: '#4A5568',
    fontSize: 14,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    padding: 24,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 4,
  },
  statCard: {
    minWidth: 120,
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  statNumber: {
    fontSize: 28,
    fontWeight: '800',
    color: '#3182CE',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#718096',
    fontWeight: '500',
    textAlign: 'center',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2D3748',
  },
  seeAllText: {
    color: '#3182CE',
    fontSize: 14,
    fontWeight: '600',
  },
  patientList: {
    gap: 16,
    paddingBottom: 40,
  },
  patientCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  patientAvatarContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#EBF8FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  patientInitials: {
    fontSize: 18,
    fontWeight: '700',
    color: '#3182CE',
  },
  patientInfo: {
    flex: 1,
  },
  patientName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A202C',
    marginBottom: 2,
  },
  patientDetails: {
    fontSize: 13,
    color: '#718096',
    marginBottom: 4,
  },
  patientAppointment: {
    fontSize: 12,
    color: '#4A5568',
    fontWeight: '500',
  },
  statusBadgeContainer: {
    marginLeft: 8,
    alignItems: 'flex-end',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
  },
});

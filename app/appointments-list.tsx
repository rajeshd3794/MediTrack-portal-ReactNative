import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  SafeAreaView, 
  TouchableOpacity, 
  ScrollView, 
  Platform, 
  ActivityIndicator, 
  Alert,
  Modal,
  TextInput
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { getAllAppointments, deleteAppointment, updateAppointment, Appointment } from '../db/db';
import { Ionicons } from '@expo/vector-icons';

export default function AppointmentsList() {
  const router = useRouter();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Edit Modal State
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editStatus, setEditStatus] = useState('');

  const fetchAppointments = async () => {
    setLoading(true);
    try {
      const data = await getAllAppointments();
      setAppointments(data || []);
    } catch (e) {
      console.error("Retrieving appointments failed:", e);
      Alert.alert("Error", "Failed to fetch appointments from cloud.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAppointments();
  }, []);

  const handleDelete = (id: string | number) => {
    Alert.alert(
      "Confirm Delete",
      "Are you sure you want to remove this appointment?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Delete", 
          style: "destructive", 
          onPress: async () => {
            try {
              await deleteAppointment(id);
              fetchAppointments();
            } catch (e) {
              Alert.alert("Error", "Failed to delete appointment.");
            }
          } 
        }
      ]
    );
  };

  const openEditModal = (appt: Appointment) => {
    setSelectedAppt(appt);
    setEditDate(appt.appointment_date || '');
    setEditStatus(appt.status || '');
    setEditModalVisible(true);
  };

  const handleUpdate = async () => {
    if (!selectedAppt?.id) return;
    
    try {
      await updateAppointment(selectedAppt.id, {
        appointment_date: editDate,
        status: editStatus
      });
      setEditModalVisible(false);
      fetchAppointments();
      Alert.alert("Success", "Appointment updated successfully.");
    } catch (e) {
      Alert.alert("Error", "Failed to update appointment.");
    }
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'Completed': return '#48BB78';
      case 'Pending': return '#ECC94B';
      case 'Cancelled': return '#F56565';
      default: return '#A0AEC0';
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Sync Portal</Text>
          <Text style={styles.headerSubtitle}>Manage Appointments Cloud</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity 
            style={[styles.headerButton, { backgroundColor: '#3182CE' }]} 
            onPress={fetchAppointments}
          >
            <Ionicons name="refresh" size={18} color="#FFF" />
            <Text style={styles.headerButtonText}> Refresh</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.headerButton, { backgroundColor: '#E53E3E' }]} 
            onPress={() => router.replace('/admin')}
          >
            <Text style={styles.headerButtonText}>Exit</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Main Content */}
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableCellHeader, { flex: 0.5 }]}>id</Text>
            <Text style={[styles.tableCellHeader, { flex: 1.2 }]}>patient_id</Text>
            <Text style={[styles.tableCellHeader, { flex: 0.8 }]}>doctor_id</Text>
            <Text style={[styles.tableCellHeader, { flex: 1.5 }]}>appointment_date</Text>
            <Text style={[styles.tableCellHeader, { flex: 1 }]}>status</Text>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#3182CE" />
              <Text style={styles.loadingText}>Syncing with Supabase...</Text>
            </View>
          ) : appointments.length > 0 ? (
            appointments.map((appt, i) => (
              <View key={appt.id || i} style={[styles.tableRow, i % 2 !== 0 && { backgroundColor: '#F7FAFC' }]}>
                <Text style={[styles.tableCell, { flex: 0.5 }]} numberOfLines={1}>{appt.id}</Text>
                <Text style={[styles.tableCell, { flex: 1.2 }]} numberOfLines={1}>
                  {appt.patient_id}
                </Text>
                <Text style={[styles.tableCell, { flex: 0.8 }]} numberOfLines={1}>{appt.doctor_id}</Text>
                <Text style={[styles.tableCell, { flex: 1.5 }]} numberOfLines={1}>
                  {appt.appointment_date}
                </Text>
                <View style={{ flex: 1 }}>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(appt.status) + '20' }]}>
                    <Text style={[styles.statusText, { color: getStatusColor(appt.status) }]}>{appt.status}</Text>
                  </View>
                </View>
              </View>
            ))
          ) : (
            <View style={styles.emptyContainer}>
              <Ionicons name="calendar-outline" size={48} color="#CBD5E0" />
              <Text style={styles.emptyText}>No appointments found in cloud.</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EDF2F7',
    paddingTop: Platform.OS === 'android' ? 40 : 0,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1A202C',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#718096',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 10,
  },
  headerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  headerButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  content: {
    padding: 20,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  tableCellHeader: {
    fontSize: 11,
    fontWeight: '800',
    color: '#718096',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#EDF2F7',
  },
  tableCell: {
    fontSize: 14,
    color: '#2D3748',
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  loadingContainer: {
    padding: 80,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    color: '#718096',
    fontSize: 14,
  },
  emptyContainer: {
    padding: 80,
    alignItems: 'center',
  },
  emptyText: {
    marginTop: 10,
    fontSize: 16,
    color: '#A0AEC0',
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#FFF',
    width: '100%',
    maxWidth: 400,
    borderRadius: 20,
    padding: 24,
    elevation: 10,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1A202C',
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4A5568',
    marginBottom: 8,
    marginTop: 10,
  },
  input: {
    backgroundColor: '#F7FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    color: '#2D3748',
  },
  statusOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 5,
  },
  statusOption: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFF',
  },
  statusOptionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4A5568',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 30,
  },
  modalButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  modalButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFF',
  }
});

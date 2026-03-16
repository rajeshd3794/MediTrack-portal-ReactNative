import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { getAllPatients, Patient } from '../db/db';

export default function Appointments() {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState(new Date().getDate());
  const [patients, setPatients] = useState<Patient[]>([]);
  const [weekDays, setWeekDays] = useState<any[]>([]);

  useEffect(() => {
    const fetchAppointments = async () => {
      try {
        const allPatients = await getAllPatients();
        // Filter patients who have a non-Pending, non-Completed appointment
        const appts = allPatients.filter(p => 
          p.nextAppointment && 
          p.nextAppointment !== 'Pending' && 
          p.nextAppointment !== 'Completed' &&
          p.nextAppointment !== 'None'
        );
        setPatients(appts);
      } catch (e) {
        console.error("Failed to fetch appointments", e);
      }
    };
    
    const generateWeek = () => {
      const days = [];
      const today = new Date();
      for (let i = -2; i <= 4; i++) {
        const d = new Date();
        d.setDate(today.getDate() + i);
        days.push({
          day: d.toLocaleDateString('en-US', { weekday: 'short' }),
          date: d.getDate()
        });
      }
      setWeekDays(days);
    };

    fetchAppointments();
    generateWeek();
  }, []);

  const getCurrentMonthYear = () => {
    return new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };


  const getStatusColor = (status: string) => {
    switch(status) {
      case 'Upcoming': return '#3182CE';
      case 'Completed': return '#48BB78';
      case 'Cancelled': return '#E53E3E';
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
        <TouchableOpacity style={styles.addButton}>
          <Text style={styles.addText}>+ New</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        
        <View style={styles.titleContainer}>
          <Text style={styles.title}>Schedule</Text>
          <Text style={styles.subtitle}>{getCurrentMonthYear()}</Text>
        </View>

        {/* Horizontal Calendar */}
        <View style={styles.calendarContainer}>
          {weekDays.map((item) => (
            <TouchableOpacity 
              key={item.date} 
              style={[
                styles.dateCard, 
                selectedDate === item.date && styles.selectedDateCard
              ]}
              onPress={() => setSelectedDate(item.date)}
            >
              <Text style={[
                styles.dayText, 
                selectedDate === item.date && styles.selectedText
              ]}>{item.day}</Text>
              <Text style={[
                styles.dateText, 
                selectedDate === item.date && styles.selectedText
              ]}>{item.date}</Text>
              {item.date === new Date().getDate() && <View style={styles.hasEventDot} />}
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.agendaHeader}>
          <Text style={styles.agendaTitle}>Upcoming Appointments</Text>
          <Text style={styles.agendaCount}>{patients.length} Total</Text>
        </View>

        {/* Timeline/Agenda */}
        <View style={styles.agendaContainer}>
          {patients.length > 0 ? patients.map((p, index) => (
            <View key={p.id || index} style={styles.appointmentRow}>
              <View style={styles.timeColumn}>
                <Text style={styles.timeText}>{p.nextAppointment?.split(',')[1]?.trim()?.split(' ')[0] || '10:00'}</Text>
                <Text style={styles.ampmText}>{p.nextAppointment?.split(',')[1]?.trim()?.split(' ')[1] || 'AM'}</Text>
              </View>
              
              <View style={styles.timelineColumn}>
                <View style={[styles.timelineDot, index === 0 && { backgroundColor: '#3182CE' }]} />
                {index !== patients.length - 1 && <View style={styles.timelineLine} />}
              </View>

              <TouchableOpacity 
                style={styles.appointmentCard}
                onPress={() => router.push(`/patient/${p.username}`)}
              >
                <View style={styles.cardHeader}>
                  <Text style={styles.patientName}>{p.name}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(p.status || 'Upcoming') + '15' }]}>
                    <Text style={[styles.statusText, { color: getStatusColor(p.status || 'Upcoming') }]}>{p.status || 'Upcoming'}</Text>
                  </View>
                </View>
                <Text style={styles.appointmentType}>{p.condition || 'General Checkup'}</Text>
                <View style={styles.cardFooter}>
                  <Text style={styles.durationText}>⏱ 30 min</Text>
                  <TouchableOpacity onPress={() => router.push(`/patient/${p.username}`)}>
                    <Text style={styles.detailsLink}>View Details</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            </View>
          )) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No appointments found in database.</Text>
            </View>
          )}
        </View>

        <View style={{height: 60}} />
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
    paddingTop: 16,
    paddingBottom: 16,
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
  addButton: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    backgroundColor: '#3182CE',
    borderRadius: 8,
  },
  addText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  titleContainer: {
    padding: 24,
    paddingBottom: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#1A365D',
  },
  subtitle: {
    fontSize: 16,
    color: '#718096',
    marginTop: 4,
  },
  calendarContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    marginBottom: 32,
  },
  dateCard: {
    width: 60,
    height: 80,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  selectedDateCard: {
    backgroundColor: '#3182CE',
    borderColor: '#3182CE',
    shadowColor: '#3182CE',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  dayText: {
    fontSize: 13,
    color: '#718096',
    fontWeight: '500',
    marginBottom: 4,
  },
  dateText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A202C',
  },
  selectedText: {
    color: '#FFFFFF',
  },
  hasEventDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E53E3E',
    marginTop: 6,
  },
  agendaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    marginBottom: 16,
  },
  agendaTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2D3748',
  },
  agendaCount: {
    fontSize: 14,
    color: '#718096',
    fontWeight: '500',
  },
  agendaContainer: {
    paddingHorizontal: 24,
  },
  appointmentRow: {
    flexDirection: 'row',
    marginBottom: 0,
  },
  timeColumn: {
    width: 65,
    alignItems: 'flex-end',
    paddingTop: 16,
    paddingRight: 12,
  },
  timeText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2D3748',
  },
  ampmText: {
    fontSize: 12,
    color: '#718096',
    fontWeight: '600',
    marginTop: 2,
  },
  timelineColumn: {
    width: 24,
    alignItems: 'center',
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#CBD5E0',
    marginTop: 22,
    zIndex: 2,
  },
  timelineLine: {
    position: 'absolute',
    top: 34,
    bottom: -22,
    width: 2,
    backgroundColor: '#E2E8F0',
    zIndex: 1,
  },
  appointmentCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    marginTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#EDF2F7',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  patientName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A202C',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  appointmentType: {
    fontSize: 14,
    color: '#4A5568',
    marginBottom: 12,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#EDF2F7',
    paddingTop: 12,
  },
  durationText: {
    fontSize: 13,
    color: '#718096',
    fontWeight: '500',
  },
  detailsLink: {
    fontSize: 13,
    color: '#3182CE',
    fontWeight: '600',
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginTop: 16,
  },
  emptyText: {
    color: '#A0AEC0',
    fontSize: 15,
  }
});

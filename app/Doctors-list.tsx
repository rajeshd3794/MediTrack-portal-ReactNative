import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, Platform, TextInput, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { getAllDoctors, updateDoctorPassword, syncGlobalDoctors, Doctor } from '../db/db';

export default function DoctorsList() {
  const router = useRouter();
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Doctor>>({});

  const fetchDoctors = async (isManual = false) => {
    if (isManual) {
      setRefreshing(true);
      try {
        // Step 1: Sync from "different systems" (Global Registry)
        await syncGlobalDoctors();
        if (Platform.OS === 'web') {
          Alert.alert("Cloud Sync", "Migration to Supabase complete! All local records are now in the cloud.");
        }
      } catch (err) {
        console.error("Global sync failed", err);
        Alert.alert("Sync Error", "Failed to migrate data to Supabase.");
      }
    }

    try {
      // Step 2: Re-fetch the data from the local table
      const data = await getAllDoctors();
      setDoctors(data);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (e) {
      console.error("Failed to fetch doctors", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDoctors();
    
    // Auto-polling: Refresh every 30 seconds to catch "Cross-System" registrations
    const interval = setInterval(() => {
      fetchDoctors();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const handleEdit = (doctor: Doctor) => {
    setEditingId(doctor.username);
    setEditForm({ ...doctor });
  };

  const handleSave = async (username: string) => {
    if (!editForm.password) {
      Alert.alert("Error", "Password cannot be empty");
      return;
    }
    try {
      await updateDoctorPassword(username, editForm.password);
      setEditingId(null);
      fetchDoctors();
      Alert.alert("Success", "Updated successfully");
    } catch (e) {
      console.error("Failed to update", e);
      Alert.alert("Error", "Failed to update");
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <View style={{ width: 40 }} />
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Doctors Records</Text>
          {lastUpdated ? <Text style={styles.lastUpdatedText}>Last Sync: {lastUpdated}</Text> : null}
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity 
            style={[styles.refreshButton, refreshing && styles.refreshingButton]} 
            onPress={() => fetchDoctors(true)}
            disabled={refreshing}
          >
            <Text style={styles.refreshButtonText}>{refreshing ? 'Syncing...' : 'Refresh'}</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.exitButton} 
            onPress={() => router.replace('/admin')}
          >
            <Text style={styles.exitButtonText}>Exit</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.content} horizontal={false}>
        <ScrollView horizontal showsHorizontalScrollIndicator={true}>
          <View style={styles.table}>
            {/* Table Header */}
            <View style={[styles.tableRow, styles.tableHeader]}>
               <Text style={[styles.cell, styles.headerCell, { width: 120 }]}>First Name</Text>
               <Text style={[styles.cell, styles.headerCell, { width: 120 }]}>Last Name</Text>
               <Text style={[styles.cell, styles.headerCell, { width: 120 }]}>Username</Text>
               <Text style={[styles.cell, styles.headerCell, { width: 200 }]}>Email Address</Text>
               <Text style={[styles.cell, styles.headerCell, { width: 150 }]}>Password</Text>
               <Text style={[styles.cell, styles.headerCell, { width: 100 }]}>Action</Text>
            </View>

            {/* Table Body */}
            {loading ? (
              <ActivityIndicator size="small" color="#3182CE" style={{ marginVertical: 20 }} />
            ) : (
              doctors.map((doc) => (
                <View key={doc.username} style={styles.tableRow}>
                  <Text style={[styles.cell, { width: 120 }]}>{doc.firstName}</Text>
                  <Text style={[styles.cell, { width: 120 }]}>{doc.lastName}</Text>
                  <Text style={[styles.cell, { width: 120 }]}>{doc.username}</Text>
                  <Text style={[styles.cell, { width: 200 }]}>{doc.email}</Text>
                  <View style={[styles.cell, { width: 150 }]}>
                    {editingId === doc.username ? (
                      <TextInput
                        style={styles.inlineInput}
                        value={editForm.password}
                        onChangeText={(t) => setEditForm({...editForm, password: t})}
                        onBlur={() => handleSave(doc.username)}
                        onSubmitEditing={() => handleSave(doc.username)}
                        autoFocus
                      />
                    ) : (
                      <Text style={styles.passwordText}>{doc.password}</Text>
                    )}
                  </View>
                  <View style={[styles.cell, { width: 100 }]}>
                    {editingId === doc.username ? (
                      <TouchableOpacity onPress={() => handleSave(doc.username)}>
                        <Text style={styles.saveLink}>Save</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity onPress={() => handleEdit(doc)}>
                        <Text style={styles.editLink}>Edit</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              ))
            )}
          </View>
        </ScrollView>
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
  backText: {
    color: '#3182CE',
    fontSize: 16,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1A365D',
  },
  headerTitleContainer: {
    alignItems: 'center',
  },
  lastUpdatedText: {
    fontSize: 10,
    color: '#718096',
    marginTop: 2,
  },
  refreshButton: {
    backgroundColor: '#EBF8FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BEE3F8',
  },
  refreshingButton: {
    opacity: 0.6,
  },
  refreshButtonText: {
    color: '#3182CE',
    fontSize: 12,
    fontWeight: '700',
  },
  headerRight: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  exitButton: {
    backgroundColor: '#FED7D7',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FEB2B2',
  },
  exitButtonText: {
    color: '#E53E3E',
    fontSize: 12,
    fontWeight: '800',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  table: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    alignItems: 'center',
    minHeight: 56,
  },
  tableHeader: {
    backgroundColor: '#F8FAFC',
  },
  cell: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: '#4A5568',
  },
  headerCell: {
    fontWeight: '700',
    color: '#1A365D',
  },
  passwordText: {
    color: '#CBD5E0',
  },
  inlineInput: {
    borderBottomWidth: 1,
    borderBottomColor: '#3182CE',
    paddingVertical: 2,
    fontSize: 14,
    color: '#2D3748',
  },
  editLink: {
    color: '#3182CE',
    fontWeight: '700',
  },
  saveLink: {
    color: '#38A169',
    fontWeight: '700',
  },
});

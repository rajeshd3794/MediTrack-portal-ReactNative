import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, SafeAreaView, ScrollView, Modal, Pressable } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { verifyPatient } from '../db/db';

export default function Landing() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [logoTapCount, setLogoTapCount] = useState(0);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const toggleMenu = () => setIsMenuOpen(!isMenuOpen);

  const navigateTo = (path: string) => {
    setIsMenuOpen(false);
    router.push(path as any);
  };

  // Hidden admin logic
  const handleLogoTap = async () => {
    const newCount = logoTapCount + 1;
    setLogoTapCount(newCount);
    if (newCount >= 7) {
      await AsyncStorage.setItem('admin_access_token', 'dronavalli_secure_token');
      setLogoTapCount(0);
      alert('Admin Portal activated');
      router.push('/admin-login');
    }
  };

  const handleSubmit = async () => {
    if (!username || !password) {
      setError('Please enter both username and password.');
      return;
    }

    try {
      const isValid = await verifyPatient(username, password);
      
      if (isValid) {
        setError('');
        await AsyncStorage.removeItem('viewing_patient_username');
        await AsyncStorage.setItem('logged_in_patient', username);
        router.replace(`/patient-records/patient-info`);
      } else {
        setError('Invalid username or password.');
      }
    } catch (e) {
      console.error('Failed to authenticate with cloud', e);
      setError('Connection error. Please try again.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      
      {/* Header Section */}
      <View style={styles.headerContainer}>
        <TouchableOpacity activeOpacity={1} onPress={handleLogoTap}>
          <Text style={styles.headerLogoInfo}>MediTrack</Text>
        </TouchableOpacity>
        <View style={styles.headerRightGroup}>
          <TouchableOpacity style={styles.headerRegisterBtn} onPress={() => router.push('/Sign-up')}>
            <Text style={styles.headerRegisterText}>Register Now</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.hamburgerButton} onPress={toggleMenu} activeOpacity={0.7}>
            <View style={styles.hamburgerLine} />
            <View style={styles.hamburgerLine} />
            <View style={styles.hamburgerLine} />
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
            <TouchableOpacity style={styles.menuItem} onPress={() => navigateTo('/admin-login')}>
              <Text style={styles.menuItemText}>Admin</Text>
            </TouchableOpacity>
            <View style={styles.menuDivider} />
            <TouchableOpacity style={styles.menuItem} onPress={() => navigateTo('/doctor-login')}>
              <Text style={styles.menuItemText}>Doctors</Text>
            </TouchableOpacity>
            <View style={styles.menuDivider} />
            <TouchableOpacity style={styles.menuItem} onPress={() => navigateTo('/patient-auth')}>
              <Text style={styles.menuItemText}>Patients</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          
          {/* Centered Patient Login Card */}
          <View style={styles.centerCard}>
            <View style={styles.cardHeader}>
              <Text style={styles.title}>Patient Login</Text>
              <Text style={styles.subtitle}>
                Access your medical history securely
              </Text>
            </View>

            <View style={styles.form}>
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Username</Text>
                <TextInput
                  style={styles.input}
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                  placeholderTextColor="#A0AEC0"
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>Password</Text>
                <TextInput
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  placeholderTextColor="#A0AEC0"
                />
              </View>

              <View style={styles.forgotLinksRow}>
                <TouchableOpacity 
                  onPress={() => router.push('/fetch-username')}
                >
                  <Text style={styles.linkText}>Forgot Username?</Text>
                </TouchableOpacity>
                <Text style={styles.linkDivider}> | </Text>
                <TouchableOpacity 
                  onPress={() => router.push('/fetch-password')}
                >
                  <Text style={styles.linkText}>Forgot Password?</Text>
                </TouchableOpacity>
              </View>

              {error ? <Text style={styles.errorText}>{error}</Text> : null}
              <TouchableOpacity style={styles.submitButton} onPress={handleSubmit}>
                <Text style={styles.submitButtonText}>Log In</Text>
              </TouchableOpacity>
            </View>
          </View>
          
          {/* Footer Section */}
          <View style={styles.footerContainer}>
            <Text style={styles.footerText}>New to MediTrack? </Text>
            <TouchableOpacity onPress={() => router.push('/Sign-up')}>
              <Text style={styles.footerLink}>Register Now</Text>
            </TouchableOpacity>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F9FC',
  },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'android' ? 40 : 16,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerLogoInfo: {
    fontSize: 32, // h1 size roughly
    fontWeight: '800',
    color: '#000000', // STRICTLY BLACK
    letterSpacing: -0.5,
  },
  headerRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  headerRegisterBtn: {
    backgroundColor: '#1A365D',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  headerRegisterText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  hamburgerButton: {
    padding: 8,
    backgroundColor: '#F7FAFC',
    borderRadius: 8,
    gap: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  hamburgerLine: {
    width: 20,
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
    marginTop: Platform.OS === 'android' ? 100 : 70,
    marginRight: 24,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    width: 180,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  menuItem: {
    padding: 16,
    width: '100%',
  },
  menuItemText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2D3748',
  },
  menuDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    width: '100%',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerCard: {
    width: '100%',
    maxWidth: 400, // strict centering card limit
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardHeader: {
    marginBottom: 32,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1A365D',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#4A5568',
    textAlign: 'center',
  },
  form: {
    gap: 20,
  },
  inputContainer: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4A5568',
  },
  input: {
    backgroundColor: '#F7FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#2D3748',
  },
  forgotLinksRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: -8,
  },
  linkDivider: {
    color: '#CBD5E0',
    fontSize: 14,
    marginHorizontal: 4,
  },
  linkText: {
    color: '#3182CE',
    fontSize: 14,
    fontWeight: '600',
  },
  submitButton: {
    backgroundColor: '#3182CE',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 12,
    shadowColor: '#3182CE',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  errorText: {
    color: '#E53E3E',
    backgroundColor: '#FFF5F5',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    fontWeight: '500',
    fontSize: 14,
    textAlign: 'center',
  },
  footerContainer: {
    flexDirection: 'row',
    marginTop: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerText: {
    fontSize: 15,
    color: '#4A5568',
  },
  footerLink: {
    fontSize: 15,
    color: '#3182CE',
    fontWeight: '700',
  }
});

import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, SafeAreaView, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { addDoctor, getDoctorByUsername, getDoctorByEmail } from '../db/db';

export default function DoctorSignup() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    username: '',
    email: '',
    designation: '',
    password: '',
    confirmPassword: ''
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSignup = async () => {
    if (!formData.firstName || !formData.lastName || !formData.username || !formData.email || !formData.designation || !formData.password || !formData.confirmPassword) {
      setError('Please fill in all the required fields.');
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (formData.username.toLowerCase() === 'admin') {
      setError('Username is already taken.');
      return;
    }

    try {
      const existingDoctorByUsername = await getDoctorByUsername(formData.username);
      if (existingDoctorByUsername) {
        setError('Username is already taken.');
        return;
      }

      const existingDoctorByEmail = await getDoctorByEmail(formData.email);
      if (existingDoctorByEmail) {
        setError('Email already taken');
        return;
      }

      const validDomains = ['@gmail.com', '@yahoo.com', '@outlook.com'];
      const hasValidDomain = validDomains.some(domain => formData.email.toLowerCase().endsWith(domain));
      if (!hasValidDomain) {
        setError('Email must end with @gmail.com, @yahoo.com, or @outlook.com');
        return;
      }

      await addDoctor({
        firstName: formData.firstName,
        lastName: formData.lastName,
        username: formData.username,
        email: formData.email,
        designation: formData.designation,
        password: formData.password,
        timestamp: Date.now(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      });
    } catch (e: any) {
      console.error('Failed to access database', e);
      setError(`Registration failed: ${e.message || 'Please try again.'}`);
      return;
    }

    setError('');
    
    // Simulate API call for registration
    setSuccess(true);
    
    // Auto-login after signup
    await AsyncStorage.setItem('logged_in_doctor', formData.username);
    
    setTimeout(() => {
      router.replace({
        pathname: '/dashboard',
        params: { doctorName: `Dr. ${formData.firstName} ${formData.lastName}` }
      });
    }, 1500);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.centerCard}>
            <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
              <Text style={styles.backText}>← Back</Text>
            </TouchableOpacity>

            <View style={styles.header}>
              <Text style={styles.title}>Create Account</Text>
              <Text style={styles.subtitle}>Join MediCore as a Healthcare Provider</Text>
            </View>

            <View style={styles.form}>
              {error ? <Text style={styles.errorText}>{error}</Text> : null}
              {success ? <Text style={styles.successText}>Successfully registered! Redirecting...</Text> : null}
              <View style={styles.row}>
                <View style={[styles.inputContainer, { flex: 1 }]}>
                  <Text style={styles.label}>First Name</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="John"
                    value={formData.firstName}
                    onChangeText={(text) => setFormData({...formData, firstName: text})}
                    placeholderTextColor="#A0AEC0"
                  />
                </View>
                <View style={[styles.inputContainer, { flex: 1 }]}>
                  <Text style={styles.label}>Last Name</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Doe"
                    value={formData.lastName}
                    onChangeText={(text) => setFormData({...formData, lastName: text})}
                    placeholderTextColor="#A0AEC0"
                  />
                </View>
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>Username</Text>
                <TextInput
                  style={styles.input}
                  placeholder="doctor_doe"
                  value={formData.username}
                  onChangeText={(text) => setFormData({...formData, username: text})}
                  autoCapitalize="none"
                  placeholderTextColor="#A0AEC0"
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>Email Address</Text>
                <TextInput
                  style={styles.input}
                  placeholder="doctor@hospital.com"
                  value={formData.email}
                  onChangeText={(text) => setFormData({...formData, email: text})}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  placeholderTextColor="#A0AEC0"
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>Doctor Designation</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Cardiologist, General Physician"
                  value={formData.designation}
                  onChangeText={(text) => setFormData({...formData, designation: text})}
                  placeholderTextColor="#A0AEC0"
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>Password</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter password"
                  value={formData.password}
                  onChangeText={(text) => setFormData({...formData, password: text})}
                  secureTextEntry
                  placeholderTextColor="#A0AEC0"
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>Confirm Password</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Confirm password"
                  value={formData.confirmPassword}
                  onChangeText={(text) => setFormData({...formData, confirmPassword: text})}
                  secureTextEntry
                  placeholderTextColor="#A0AEC0"
                />
                {formData.confirmPassword.length > 0 && formData.password !== formData.confirmPassword && (
                  <Text style={{color: '#E53E3E', fontSize: 12, marginTop: -4}}>Password does not match confirm password</Text>
                )}
              </View>

              <TouchableOpacity style={styles.signupButton} onPress={handleSignup}>
                <Text style={styles.signupButtonText}>Create Account</Text>
              </TouchableOpacity>

              <View style={styles.loginContainer}>
                <Text style={styles.loginText}>Already have an account? </Text>
                <TouchableOpacity onPress={() => router.push('/doctor-login')}>
                  <Text style={styles.loginLink}>Log In</Text>
                </TouchableOpacity>
              </View>
            </View>
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
    maxWidth: 450,
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
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: 20,
  },
  backText: {
    fontSize: 16,
    color: '#3182CE',
    fontWeight: '700',
  },
  header: {
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
  row: {
    flexDirection: 'row',
    gap: 16,
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
  signupButton: {
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
  signupButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  loginContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 16,
    marginBottom: 40,
  },
  loginText: {
    color: '#718096',
    fontSize: 14,
  },
  loginLink: {
    color: '#3182CE',
    fontSize: 14,
    fontWeight: '700',
  },
  errorText: {
    color: '#E53E3E',
    fontSize: 14,
    fontWeight: '500',
    backgroundColor: '#FFF5F5',
    padding: 12,
    borderRadius: 8,
    overflow: 'hidden',
  },
  successText: {
    color: '#38A169',
    fontSize: 14,
    fontWeight: '500',
    backgroundColor: '#F0FFF4',
    padding: 12,
    borderRadius: 8,
    overflow: 'hidden',
  }
});
